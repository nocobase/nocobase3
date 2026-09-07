import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import type { AuditSettings } from '../contracts.js';

export function SettingsSummary({
  settings,
  days,
}: {
  readonly settings: AuditSettings;
  readonly days?: string;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-audit');
  const yes = (value: boolean): string =>
    t(value ? 'settings.yes' : 'settings.no');
  const values: readonly (readonly [string, string | number])[] = [
    ['settings.enabled', yes(settings.enabled)],
    ['settings.http', yes(settings.sources.http !== 'disabled')],
    ['settings.runtime', yes(settings.sources.runtime !== 'disabled')],
    ['settings.observationStore', settings.observationStore],
    [
      'settings.retention',
      settings.retentionDays === null
        ? t('settings.forever')
        : (days ?? settings.retentionDays),
    ],
    ['settings.detailsLimit', settings.maxDetailsBytes],
  ];
  return (
    <div className='space-y-3 rounded border border-border p-3 text-sm'>
      <p>{t('settings.revision', { revision: settings.revision })}</p>
      <dl>
        {values.map(([key, value]) => (
          <div className='grid grid-cols-2 gap-2 py-1' key={key}>
            <dt>{t(key)}</dt>
            <dd className='break-all'>{value}</dd>
          </div>
        ))}
      </dl>
      <h4>{t('settings.database')}</h4>
      <ul>
        {settings.sources.database.map((target) => (
          <li key={JSON.stringify(target)}>
            {target.dataSource} / {target.schema ? target.schema + '.' : ''}
            {target.table}
          </li>
        ))}
      </ul>
    </div>
  );
}
