import { inspectionStatus } from './inspector-status.js';
import { InspectionConditions } from './inspector-conditions.js';
import type { ReactElement } from 'react';
import type {
  AuthorizationDecision,
  AuthorizationReason,
} from '../authorization-client.js';
import { Badge } from '../components/ui/badge.js';
import { useAuthorizationTranslation } from '../i18n.js';
const effectStyles: Readonly<Record<string, string>> = {
  permit: 'bg-primary/10 text-primary',
  conditional: 'bg-muted text-foreground',
  deny: 'bg-destructive/10 text-destructive',
};

export function Decision({
  value,
  fields,
}: {
  fields: readonly string[];
  value: AuthorizationDecision;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <div className='space-y-5'>
      <section className='space-y-2'>
        <h3 className='text-xs font-medium text-muted-foreground uppercase'>
          {t('inspector.decision')}
        </h3>
        <Badge
          className={
            inspectionStatus(value, fields) === 'context'
              ? 'bg-muted text-foreground'
              : (effectStyles[value.effect] ?? 'bg-muted')
          }
        >
          {t(`inspector.status.${inspectionStatus(value, fields)}`)}
        </Badge>
      </section>
      <section className='space-y-2'>
        <h3 className='text-xs font-medium text-muted-foreground uppercase'>
          {t('inspector.reasons')}
        </h3>
        {value.reasons.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('inspector.noReasons')}
          </p>
        ) : (
          <ul className='space-y-2'>
            {value.reasons.map((reason, index) => (
              <li
                className='rounded-lg border px-4 py-3'
                // The core returns an ordered list carrying no identity of its
                // own, and the list is replaced whole rather than reordered.
                // eslint-disable-next-line @eslint-react/no-array-index-key
                key={`${reason.code}-${index}`}
              >
                <Reason value={reason} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {value.conditions ? (
        <section className='space-y-2'>
          <h3 className='text-xs font-medium text-muted-foreground uppercase'>
            {t('inspector.conditions')}
          </h3>
          <InspectionConditions value={value.conditions} />
          <details className='text-xs text-muted-foreground'>
            <summary className='cursor-pointer'>
              {t('inspector.technicalDetails')}
            </summary>
            <pre className='mt-3 overflow-auto'>
              {JSON.stringify(value.conditions, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}

/** One reason as it arrived: its message, where it came from, and its code. */
function Reason({ value }: { value: AuthorizationReason }): ReactElement {
  const t = useAuthorizationTranslation();
  const source = value.details?.source;
  const sourceInfo =
    source && typeof source === 'object'
      ? (source as Record<string, unknown>)
      : undefined;
  return (
    <>
      <p className='text-sm'>
        {t(`inspector.reasonCodes.${value.code}`, {
          defaultValue: value.message,
        })}
      </p>
      {sourceInfo &&
      typeof sourceInfo.id === 'string' &&
      typeof sourceInfo.plugin === 'string' ? (
        <p className='mt-1 text-sm'>
          {t(`inspector.sources.${sourceInfo.plugin}`, {
            defaultValue: sourceInfo.plugin,
          })}{' '}
          · {sourceInfo.id}
        </p>
      ) : null}
      <p className='mt-1 text-xs text-muted-foreground'>
        {value.plugin === undefined
          ? t('inspector.reasonFromCore')
          : t('inspector.reasonFrom', { plugin: value.plugin })}
        {' · '}
        <span className='font-mono'>{value.code}</span>
      </p>
    </>
  );
}
