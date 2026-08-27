import { Database, Save, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslate } from '@refinedev/core';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  type HubFetcher,
  type HubSettings,
  type HubSystemInfo,
  hubPatch,
  useHubQuery,
} from '@/features/hub/api';
import {
  formatHubDate,
  getHubErrorMessage,
  HubErrorState,
  HubLoadingState,
} from '@/features/hub/components';
import { HubPageHeader } from '@/features/hub/management-components';

export interface HubSettingsPageProps {
  fetcher?: HubFetcher;
}

export function HubSettingsPage({ fetcher }: HubSettingsPageProps) {
  const translate = useTranslate();
  const settings = useHubQuery<HubSettings>({ path: '/settings', fetcher });
  const systemInfo = useHubQuery<HubSystemInfo>({
    path: '/system-info',
    fetcher,
  });
  const [draft, setDraft] = useState<HubSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);
  const save = () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    void hubPatch<HubSettings>(
      '/settings',
      {
        releaseRetention: {
          automaticCleanupEnabled:
            draft.releaseRetention.automaticCleanupEnabled,
          keepPerApplication: draft.releaseRetention.keepPerApplication,
          minimumAgeDays: draft.releaseRetention.minimumAgeDays,
        },
        audit: {
          recordDeniedMutations: draft.audit.recordDeniedMutations,
          retentionDays: draft.audit.retentionDays,
        },
        confirmation: draft.confirmation,
      },
      fetcher,
      { 'if-match': `"rev-${draft.revision}"` },
    )
      .then((response) => {
        setDraft(response.data);
        settings.reload();
      })
      .catch((reason: unknown) =>
        setSaveError(
          reason instanceof Error ? reason : new Error(String(reason)),
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className='space-y-6'>
      <HubPageHeader
        eyebrow={
          <>
            <Settings2 aria-hidden='true' />
            {translate('hub.settings.eyebrow', 'Hub administration')}
          </>
        }
        title={translate('hub.settings.title', 'Hub settings')}
        description={translate(
          'hub.settings.description',
          'Configure Release retention, audit retention, and confirmation policies.',
        )}
        actions={
          draft ? (
            <Button onClick={save} disabled={saving}>
              <Save aria-hidden='true' />
              {saving
                ? translate('hub.settings.saving', 'Saving…')
                : translate('hub.settings.save', 'Save settings')}
            </Button>
          ) : null
        }
      />
      {saveError ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {translate('hub.settings.saveError', 'Unable to save settings')}
          </AlertTitle>
          <AlertDescription>
            {getHubErrorMessage(saveError, translate)}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className='max-w-2xl'>
        <SystemInfoCard query={systemInfo} />
      </div>
      {settings.error ? (
        <HubErrorState error={settings.error} onRetry={settings.reload} />
      ) : settings.loading || !draft ? (
        <HubLoadingState
          label={translate('hub.settings.loading', 'Loading settings')}
        />
      ) : (
        <SettingsEditor value={draft} onChange={setDraft} />
      )}
    </div>
  );
}

function SystemInfoCard({
  query,
}: {
  query: ReturnType<typeof useHubQuery<HubSystemInfo>>;
}) {
  const translate = useTranslate();
  if (query.error)
    return <HubErrorState error={query.error} onRetry={query.reload} />;
  if (query.loading || !query.data)
    return (
      <HubLoadingState
        label={translate(
          'hub.systemInfo.loading',
          'Loading system information',
        )}
      />
    );
  const info = query.data;
  const items: Array<[string, string | undefined]> = [
    [translate('hub.systemInfo.hubVersion', 'Hub version'), info.hubVersion],
    [translate('hub.systemInfo.nodeVersion', 'Node.js'), info.nodeVersion],
    [translate('hub.systemInfo.database', 'Database'), info.databaseType],
    [
      translate('hub.systemInfo.hostMode', 'APP Host mode'),
      info.hostMode
        ? translate(
            `hub.systemInfo.hostMode.${camelCase(info.hostMode)}`,
            info.hostMode,
          )
        : undefined,
    ],
    [
      translate('hub.systemInfo.basePath', 'Public base path'),
      info.publicBasePath,
    ],
    [
      translate('hub.systemInfo.startedAt', 'Started'),
      formatHubDate(info.startedAt),
    ],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Database className='size-4' />
          {translate('hub.systemInfo.title', 'Runtime information')}
        </CardTitle>
        <CardDescription>
          {translate(
            'hub.systemInfo.description',
            'Read-only, security-filtered information for diagnosing this Hub deployment.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <dl className='space-y-3'>
          {items.map(([label, value]) => (
            <div
              key={label}
              className='flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0'
            >
              <dt className='text-sm text-muted-foreground'>{label}</dt>
              <dd className='text-right text-sm font-medium'>{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {info.warnings?.length ? (
          <Alert>
            <AlertTitle>
              {translate('hub.systemInfo.warnings', 'Configuration warnings')}
            </AlertTitle>
            <AlertDescription>
              <ul className='list-disc space-y-1 pl-4'>
                {info.warnings.map((warning) => (
                  <li key={warning}>
                    {translate(
                      `hub.systemInfo.warning.${systemWarningKey(warning)}`,
                      warning,
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SettingsEditor({
  value,
  onChange,
}: {
  value: HubSettings;
  onChange: (value: HubSettings) => void;
}) {
  const translate = useTranslate();
  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>
            {translate('hub.settings.retention.title', 'Release retention')}
          </CardTitle>
          <CardDescription>
            {translate(
              'hub.settings.retention.description',
              'Active, previous successful, in-progress, pinned, and minimum-age Releases are always protected.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <NumberSetting
            id='keep-releases'
            label={translate(
              'hub.settings.retention.keep',
              'Historical Releases per application',
            )}
            description={translate(
              'hub.settings.retention.keepDescription',
              'Oldest unreferenced Releases become cleanup candidates after this count.',
            )}
            value={value.releaseRetention.keepPerApplication}
            min={1}
            max={1000}
            onChange={(next) =>
              onChange({
                ...value,
                releaseRetention: {
                  ...value.releaseRetention,
                  keepPerApplication: next,
                },
              })
            }
          />
          <NumberSetting
            id='minimum-age'
            label={translate(
              'hub.settings.retention.minimumAge',
              'Minimum retention in days',
            )}
            description={translate(
              'hub.settings.retention.minimumAgeDescription',
              'Releases newer than this value never become cleanup candidates.',
            )}
            value={value.releaseRetention.minimumAgeDays}
            min={0}
            max={3650}
            onChange={(next) =>
              onChange({
                ...value,
                releaseRetention: {
                  ...value.releaseRetention,
                  minimumAgeDays: next,
                },
              })
            }
          />
          <BooleanSetting
            label={translate(
              'hub.settings.retention.automatic',
              'Automatic cleanup',
            )}
            description={translate(
              'hub.settings.retention.automaticDescription',
              'Unavailable until deletion and recovery safeguards are enabled by the server.',
            )}
            checked={value.releaseRetention.automaticCleanupEnabled}
            disabled
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {translate('hub.settings.safety.title', 'Audit and confirmations')}
          </CardTitle>
          <CardDescription>
            {translate(
              'hub.settings.safety.description',
              'Control management audit retention and confirmations for high-impact actions.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <NumberSetting
            id='audit-retention'
            label={translate(
              'hub.settings.audit.retention',
              'Audit retention in days',
            )}
            description={translate(
              'hub.settings.audit.retentionDescription',
              'How long Hub keeps management audit events.',
            )}
            value={value.audit.retentionDays}
            min={1}
            max={3650}
            onChange={(next) =>
              onChange({
                ...value,
                audit: { ...value.audit, retentionDays: next },
              })
            }
          />
          <BooleanSetting
            label={translate(
              'hub.settings.audit.denied',
              'Record denied mutations',
            )}
            description={translate(
              'hub.settings.audit.deniedDescription',
              'Record safe metadata for denied management requests after rate limiting.',
            )}
            checked={value.audit.recordDeniedMutations}
            onChange={(checked) =>
              onChange({
                ...value,
                audit: { ...value.audit, recordDeniedMutations: checked },
              })
            }
          />
          <BooleanSetting
            label={translate(
              'hub.settings.confirm.rollback',
              'Confirm rollbacks',
            )}
            checked={value.confirmation.rollback}
            onChange={(checked) =>
              onChange({
                ...value,
                confirmation: { ...value.confirmation, rollback: checked },
              })
            }
          />
          <BooleanSetting
            label={translate(
              'hub.settings.confirm.archive',
              'Confirm application archive',
            )}
            checked={value.confirmation.archiveApplication}
            onChange={(checked) =>
              onChange({
                ...value,
                confirmation: {
                  ...value.confirmation,
                  archiveApplication: checked,
                },
              })
            }
          />
          <BooleanSetting
            label={translate(
              'hub.settings.confirm.rotate',
              'Confirm Runtime Secret rotation',
            )}
            checked={value.confirmation.rotateRuntimeSecret}
            onChange={(checked) =>
              onChange({
                ...value,
                confirmation: {
                  ...value.confirmation,
                  rotateRuntimeSecret: checked,
                },
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function NumberSetting({
  id,
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
      </div>
      <Input
        id={id}
        type='number'
        className='w-28'
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
function BooleanSetting({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div>
        <p className='text-sm font-medium'>{label}</p>
        {description ? (
          <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  );
}

function systemWarningKey(value: string): string {
  if (value === 'Runtime secret encryption is not configured.') {
    return 'runtimeSecretEncryption';
  }
  return camelCase(value);
}

function camelCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, character: string) =>
      character.toUpperCase(),
    )
    .replace(/^./, (character) => character.toLowerCase());
}

export default HubSettingsPage;
