import { inspectionStatus } from './inspector-status.js';
import { InspectionConditions } from './inspector-conditions.js';
import type { ReactElement } from 'react';
import type {
  AuthorizationDecision,
  AuthorizationReason,
  AuthorizationOptions,
  ResourceOption,
} from '../authorization-client.js';
import { Badge } from '../components/ui/badge.js';
import { useAuthorizationTranslation } from '../i18n.js';

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function reasonKey(reason: AuthorizationReason): string {
  const source = object(reason.details?.source);
  if (reason.code === 'GRANT_MATCHED' && source)
    return JSON.stringify([reason.code, source.plugin, source.id]);
  return JSON.stringify([reason.code, reason.details ?? reason.message]);
}

/** Keep the same source once even when its grant also appears in underlying checks. */
function uniqueReasons(
  reasons: readonly AuthorizationReason[],
): AuthorizationReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = reasonKey(reason);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function Decision({
  value,
  fields,
  options,
  resource,
  action,
}: {
  fields: readonly string[];
  value: AuthorizationDecision;
  options?: AuthorizationOptions;
  resource?: ResourceOption;
  action?: string;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const status = inspectionStatus(value, fields);
  const business =
    value.conditions?.type === 'resource' || !!value.checks?.length;
  const checks =
    value.checks?.filter(
      (check) => check.resource.type === 'database.collection',
    ) ?? [];
  const reasons = uniqueReasons(
    value.reasons.filter(
      (reason) =>
        !business ||
        !['PAGE_ACCESS_GRANTED', 'SCOPE_EXPANDED', 'SCOPE_RESTRICTED'].includes(
          reason.code,
        ),
    ),
  );
  return (
    <div className='space-y-6'>
      <section className='space-y-2 rounded-lg bg-muted/40 p-4'>
        <h3 className='text-sm font-medium'>{t('inspector.decision')}</h3>
        <Badge
          className={
            status === 'none' || status === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary'
          }
        >
          {t(`inspector.status.${status}`)}
        </Badge>
        <p className='text-sm'>{t(`inspector.summary.${status}`)}</p>
      </section>
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('inspector.reasons')}</h3>
        {reasons.length ? (
          reasons.map((reason, index) => (
            // Reasons have no stable identity beyond their deduplicated position.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <Reason key={index} value={reason} options={options} />
          ))
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('inspector.noReasons')}
          </p>
        )}
      </section>
      {business && checks.length > 0 && (
        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('inspector.dataAccess')}</h3>
          <p className='text-sm text-muted-foreground'>
            {t('inspector.subjectHint')}
          </p>
          {checks.map((check) => {
            const scope = resource?.ruleScopes?.find(
              (item) =>
                item.action === action && item.collection === check.resource.id,
            );
            const scopeReasons = uniqueReasons(
              check.decision.reasons.filter(
                (reason) =>
                  !reasons.some(
                    (shown) => reasonKey(shown) === reasonKey(reason),
                  ),
              ),
            );
            return (
              <section
                key={JSON.stringify([check.resource, check.action])}
                className='space-y-3 rounded-lg border p-4'
              >
                <h4 className='font-medium'>
                  {scope?.label ?? resource?.label ?? t('inspector.dataAccess')}{' '}
                  ·{' '}
                  {t(`inspector.databaseActions.${check.action}`, {
                    defaultValue: check.action,
                  })}
                </h4>
                {inspectionStatus(check.decision) === 'none' && (
                  <p className='text-sm text-destructive'>
                    {t('inspector.summary.none')}
                  </p>
                )}
                {scopeReasons.map((reason, index) => (
                  // Each check replaces the whole ordered reason list.
                  // eslint-disable-next-line @eslint-react/no-array-index-key
                  <Reason key={index} value={reason} options={options} />
                ))}
                {check.decision.conditions && (
                  <details className='text-sm'>
                    <summary className='cursor-pointer'>
                      {t('inspector.scopeAndFields')}
                    </summary>
                    <div className='mt-3'>
                      <InspectionConditions value={check.decision.conditions} />
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </section>
      )}
      {!business && value.conditions?.type === 'database' && (
        <InspectionConditions value={value.conditions} />
      )}
      <details className='border-t pt-3 text-xs text-muted-foreground'>
        <summary className='cursor-pointer'>
          {t('inspector.technicalDetails')}
        </summary>
        <p className='mt-3'>{t('inspector.technicalHint')}</p>
        <pre className='mt-3 max-h-96 overflow-auto'>
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Reason({
  value,
  options,
}: {
  value: AuthorizationReason;
  options?: AuthorizationOptions;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const source = object(value.details?.source);
  const scope = object(value.details?.scope);
  const access = scope?.recordAccess;
  const policy = typeof access === 'string' ? access : object(access)?.key;
  const label = options?.recordAccessPolicies.find(
    (item) => item.value === policy,
  )?.label;
  const title = source?.title;
  const descriptor = object(title);
  const sourceTitle =
    typeof title === 'string'
      ? title
      : typeof descriptor?.key === 'string' && typeof descriptor.ns === 'string'
        ? t(descriptor.key, { ns: descriptor.ns })
        : undefined;
  const scopeLabel =
    label ??
    (scope?.type === 'all'
      ? t('labels.allRecords')
      : scope?.type === 'ids'
        ? t('inspector.selectedRecords', {
            count: Array.isArray(scope.ids) ? scope.ids.length : 0,
          })
        : undefined);
  return (
    <div className='space-y-1 text-sm'>
      <p>
        <span>
          {t(`inspector.reasonCodes.${value.code}`, {
            defaultValue: value.message,
          })}
        </span>
        {sourceTitle && (
          <>
            {' '}
            · <span className='font-medium'>{sourceTitle}</span>
          </>
        )}
      </p>
      {scopeLabel ? (
        <p className='text-muted-foreground'>{scopeLabel}</p>
      ) : null}
    </div>
  );
}
