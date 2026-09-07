import type { AppClient } from '@nocobase/app-client';
import type {
  AuditHealthDto,
  AuditSettingsResponse,
  AuditSettings,
  AuditSettingsUpdate,
} from '../contracts.js';

export class SettingsApi {
  constructor(private readonly client: AppClient) {}
  get(store: string, signal?: AbortSignal): Promise<AuditSettingsResponse> {
    return this.client.request(
      'audit/settings?store=' + encodeURIComponent(store),
      { signal },
    );
  }
  async save(
    store: string,
    update: AuditSettingsUpdate,
  ): Promise<AuditSettings> {
    const result = await this.client.request<{ data: AuditSettings }>(
      'audit/settings?store=' + encodeURIComponent(store),
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'if-match': '"' + update.expectedRevision + '"',
        },
        body: JSON.stringify(update),
      },
    );
    return result.data;
  }
  async health(
    store: string,
    instanceId: string,
    signal?: AbortSignal,
  ): Promise<AuditHealthDto> {
    const query = new URLSearchParams({ store });
    if (instanceId) query.set('instanceId', instanceId);
    const result = await this.client.request<{ data: AuditHealthDto }>(
      'audit/health?' + query.toString(),
      { signal },
    );
    return result.data;
  }
}

export function settingsError(error: unknown): string {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : undefined;
  if (status === 401 || status === 403) return 'settings.forbidden';
  if (status === 409) return 'settings.conflict';
  if (status === 400) return 'settings.invalid';
  if (error && typeof error === 'object' && 'payload' in error) {
    const payload = error.payload;
    if (
      payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      payload.code === 'AUDIT_TARGET_UNSUPPORTED'
    )
      return 'settings.invalidStore';
  }
  return 'settings.unavailable';
}

export const control: string =
  'rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50';

export function formText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}
