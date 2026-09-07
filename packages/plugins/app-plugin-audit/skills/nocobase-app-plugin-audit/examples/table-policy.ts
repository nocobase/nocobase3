import type { AppClient } from '@nocobase/app-client';
import type {
  AuditSettings,
  AuditSettingsResponse,
  AuditSettingsUpdate,
} from '@nocobase/app-plugin-audit/client/contracts';

// Pass the application's authenticated API client. Paths are relative to its API base.
export async function selectExampleTable(
  client: Pick<AppClient, 'request'>,
): Promise<AuditSettingsResponse> {
  const response = await client.request<AuditSettingsResponse>(
    'audit/settings?store=main',
  );
  if (!response.meta?.canManage || !response.meta.complete) {
    throw new Error(
      'Complete Audit settings management permission is required.',
    );
  }
  const { revision, ...current } = response.data;
  const database = current.sources.database.filter(
    (entry) =>
      !(entry.dataSource === 'main' && entry.table === 'audit_example_items'),
  );
  const settings: Omit<AuditSettings, 'revision'> = {
    ...current,
    enabled: true,
    sources: {
      ...current.sources,
      database: [
        ...database,
        { dataSource: 'main', table: 'audit_example_items' },
      ],
    },
  };
  return client.request<AuditSettingsResponse>('audit/settings?store=main', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'if-match': '"' + revision + '"',
    },
    body: JSON.stringify({
      expectedRevision: revision,
      settings,
      confirmRetentionReduction: false,
    } satisfies AuditSettingsUpdate),
  });
}
