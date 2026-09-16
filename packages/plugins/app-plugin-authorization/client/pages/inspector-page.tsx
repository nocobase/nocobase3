import { SubjectPicker } from '../components/subject-picker.js';
import { useResourceOptions } from '../components/use-resource-options.js';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  RefreshCw,
  Shield,
} from 'lucide-react';
import type {
  AuthorizationInspection,
  AuthorizationOptions,
  AuthorizationSubject,
} from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { PermissionsPage } from '../components/page-shell.js';
import { SearchField } from '../components/filters.js';
import { Button } from '../components/ui/button.js';
import { ErrorBox, errorMessage } from '../components/feedback.js';
import { RuleDrawer } from '../components/rule-drawer.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from './page-support.js';
import { ScopeMark } from './permission-sets/marks.js';
import { resourceRows } from './permission-sets/resource-groups.js';
import { inspectionStatus } from './inspector-status.js';
import { Decision } from './inspector-decision.js';

const authz = getAuthorizationClient();
const pageSize = 20;
export default function InspectorPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('authz/permission-sets/options');
  const options = useResourceOptions(page.options);
  return (
    <PermissionsPage
      title={t('inspector.page.title')}
      description={t('inspector.page.description')}
    >
      {options ? (
        <Inspector options={options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}

function Inspector({
  options,
}: {
  options: AuthorizationOptions;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [params, setParams] = useSearchParams();
  const subjectType =
    params.get('subjectType') ?? (params.has('user') ? 'user' : undefined);
  const subjectId = params.get('subjectId') ?? params.get('user') ?? '';
  const subject = useMemo<AuthorizationSubject | undefined>(
    () =>
      subjectType && subjectId
        ? { type: subjectType, id: subjectId }
        : undefined,
    [subjectType, subjectId],
  );
  const type =
    options.resourceTypes.find((item) => item.value === params.get('type')) ??
    options.resourceTypes.find((item) => item.resources.length > 0) ??
    options.resourceTypes[0];
  const search = params.get('search') ?? '';
  const requestedPage = Number(params.get('page'));
  const requestedPageNumber =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [results, setResults] = useState<readonly AuthorizationInspection[]>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [configured, setConfigured] = useState<{
    key: string;
    unrestricted: boolean;
    types: readonly string[];
  }>();
  const configurationKey = JSON.stringify([subject, revision]);
  useEffect(() => {
    if (!subject) return;
    let active = true;
    void authz.inspectConfigured(subject).then(
      (result) => {
        if (active) setConfigured({ ...result, key: configurationKey });
      },
      (cause: unknown) => {
        if (active) setError(errorMessage(t, cause));
      },
    );
    return () => {
      active = false;
    };
  }, [subject, configurationKey, t]);
  const [detail, setDetail] = useState<AuthorizationInspection>();
  const [detailKey, setDetailKey] = useState('');
  const filtered = useMemo(
    () =>
      (type?.resources ?? []).filter((item) =>
        `${item.label} ${item.value}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [type, search],
  );
  const page = Math.min(
    requestedPageNumber,
    Math.max(1, Math.ceil(filtered.length / pageSize)),
  );
  const visible = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page],
  );
  const actions = useMemo(
    () => [
      ...new Map(
        [
          ...(type?.actions ?? []),
          ...visible.flatMap((item) => item.actions ?? []),
        ].map((item) => [item.value, item]),
      ).values(),
    ],
    [type, visible],
  );
  const checks = useMemo(
    () =>
      visible.flatMap((item) =>
        (item.actions ?? type?.actions ?? []).map((action) => ({
          resource: { type: type.value, id: item.value },
          action: action.value,
        })),
      ),
    [visible, type],
  );
  const queryKey = JSON.stringify([subject, checks, revision]);
  const [loadedKey, setLoadedKey] = useState('');
  function change(key: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      if (key === 'type') next.delete('search');
      return next;
    });
    setDetail(undefined);
    setError(undefined);
  }
  useEffect(() => {
    let active = true;
    if (!subject) return;
    void (async () => {
      const next: AuthorizationInspection[] = [];
      for (let offset = 0; offset < checks.length; offset += 100) {
        if (!active) return;
        next.push(
          ...(await authz.inspectBatch(
            subject,
            checks.slice(offset, offset + 100),
          )),
        );
      }
      if (active) {
        setError(undefined);
        setResults(next);
        setLoadedKey(queryKey);
      }
    })().catch((cause: unknown) => {
      if (active) setError(errorMessage(t, cause));
    });
    return () => {
      active = false;
    };
  }, [subject, checks, queryKey, t]);
  const loading = !!subject && loadedKey !== queryKey && !error;
  const selectedResource =
    detail && type?.resources.find((item) => item.value === detail.resource.id);
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3'>
        <SubjectPicker
          types={options.subjectTypes}
          selectedType={subjectType}
          value={subject}
          onChange={(next, type) => {
            setParams((previous) => {
              const updated = new URLSearchParams(previous);
              updated.delete('user');
              updated.delete('page');
              updated.set('subjectType', type);
              if (next) updated.set('subjectId', next.id);
              else updated.delete('subjectId');
              return updated;
            });
            setDetail(undefined);
            setError(undefined);
          }}
        />
        <Button
          variant='outline'
          className='ml-auto'
          disabled={!subject || loading}
          onClick={() => {
            setError(undefined);
            setRevision((value) => value + 1);
          }}
        >
          <RefreshCw className='size-4' />
          {t('inspector.refresh')}
        </Button>
      </div>
      {!subject ? (
        <p className='p-8 text-center text-muted-foreground'>
          {t('inspector.empty')}
        </p>
      ) : (
        <div className='flex min-h-[60vh] gap-3'>
          <nav
            aria-label={t('editors.resourceType')}
            className='w-40 shrink-0 space-y-1 rounded-lg border bg-card p-2'
          >
            <h2 className='px-3 py-2 text-xs font-medium text-muted-foreground'>
              {t('editors.resourceType')}
            </h2>
            {options.resourceTypes.map((item) => (
              <Button
                key={item.value}
                className='w-full justify-start'
                variant={item === type ? 'outline' : 'ghost'}
                aria-label={item.label}
                aria-current={item === type ? 'page' : undefined}
                onClick={() => {
                  change('type', item.value);
                  setCollapsed(new Set());
                }}
              >
                <span className='flex-1 text-left'>{item.label}</span>
                {configured?.key === configurationKey &&
                (configured.unrestricted ||
                  configured.types.includes(item.value)) ? (
                  <span
                    role='img'
                    title={t('permissionWorkspace.configured')}
                    aria-label={t('permissionWorkspace.configured')}
                    className='shrink-0 text-muted-foreground'
                  >
                    <Shield className='size-3.5' aria-hidden='true' />
                  </span>
                ) : null}
              </Button>
            ))}
          </nav>
          <div className='min-w-0 flex-1 space-y-3'>
            <SearchField
              label={t('permissionSets.picker.searchResources')}
              placeholder={t('permissionSets.picker.searchResources')}
              value={search}
              onChange={(value) => change('search', value)}
            />
            {error ? <ErrorBox value={error} /> : null}
            <div
              aria-busy={loading}
              className='max-h-[60vh] overflow-auto rounded-lg border bg-card'
            >
              <table className='w-full table-fixed text-sm'>
                <thead className='sticky top-0 z-10 bg-background'>
                  <tr>
                    <th className='p-3 text-left'>{t('common.resource')}</th>
                    {actions.map((action) => (
                      <th key={action.value} className='w-24 p-3 text-center'>
                        {action.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resourceRows(type?.groups ?? [], visible, collapsed).map(
                    (row) =>
                      row.kind === 'group' ? (
                        <tr
                          key={`group:${row.group.value}`}
                          className='border-t bg-muted/30'
                        >
                          <td colSpan={actions.length + 1}>
                            <button
                              className='flex w-full items-center gap-2 py-2 text-left font-medium'
                              style={{ paddingLeft: 12 + row.depth * 16 }}
                              onClick={() =>
                                setCollapsed((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(row.group.value))
                                    next.delete(row.group.value);
                                  else next.add(row.group.value);
                                  return next;
                                })
                              }
                              aria-expanded={!collapsed.has(row.group.value)}
                            >
                              {collapsed.has(row.group.value) ? (
                                <ChevronRight className='size-4' />
                              ) : (
                                <ChevronDown className='size-4' />
                              )}
                              {row.group.label}
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.item.value} className='border-t'>
                          <td
                            className='py-3 pr-3'
                            style={{ paddingLeft: 12 + row.depth * 16 }}
                          >
                            {row.item.label}
                          </td>
                          {actions.map((action) => {
                            const result =
                              loadedKey === queryKey
                                ? results?.find(
                                    (item) =>
                                      item.resource.id === row.item.value &&
                                      item.action === action.value,
                                  )
                                : undefined;
                            const supported = (
                              row.item.actions ??
                              type?.actions ??
                              []
                            ).some((item) => item.value === action.value);
                            const status =
                              result &&
                              inspectionStatus(
                                result.decision,
                                options.collections.find(
                                  (item) => item.name === row.item.value,
                                )?.fields,
                              );
                            return (
                              <td key={action.value} className='text-center'>
                                {!supported ? (
                                  '—'
                                ) : !result ? (
                                  <span className='text-muted-foreground'>
                                    {loading ? '…' : '—'}
                                  </span>
                                ) : (
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    aria-label={`${row.item.label}: ${action.label}`}
                                    onClick={() => {
                                      setDetailKey(queryKey);
                                      setDetail(result);
                                    }}
                                  >
                                    {status === 'context' ? (
                                      <CircleHelp
                                        className='size-4 text-muted-foreground'
                                        aria-label={t(
                                          'inspector.status.context',
                                        )}
                                      />
                                    ) : status === 'error' ? (
                                      <CircleAlert
                                        className='size-4 text-destructive'
                                        aria-label={t('inspector.failed')}
                                      />
                                    ) : (
                                      <ScopeMark
                                        value={status!}
                                        label={t(`inspector.status.${status}`)}
                                      />
                                    )}
                                  </Button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ),
                  )}
                </tbody>
              </table>
              {!visible.length ? (
                <p className='p-8 text-center text-muted-foreground'>
                  {t(
                    type?.resources.length
                      ? 'inspector.noResources'
                      : 'inspector.noRegisteredResources',
                  )}
                </p>
              ) : null}
            </div>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
                {(['all', 'scoped', 'none'] as const).map((status) => (
                  <span key={status} className='flex items-center gap-1'>
                    <ScopeMark
                      legend
                      value={status}
                      label={t(`inspector.status.${status}`)}
                    />
                    {t(`inspector.status.${status}`)}
                  </span>
                ))}
              </div>
              <div className='flex items-center gap-2 text-sm'>
                <span>
                  {page} / {Math.max(1, Math.ceil(filtered.length / pageSize))}
                </span>
                <Button
                  variant='outline'
                  disabled={page <= 1}
                  onClick={() => change('page', String(page - 1))}
                >
                  {t('subjects.previous')}
                </Button>
                <Button
                  variant='outline'
                  disabled={page * pageSize >= filtered.length}
                  onClick={() => change('page', String(page + 1))}
                >
                  {t('subjects.next')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {detail && detailKey === queryKey && loadedKey === queryKey ? (
        <RuleDrawer
          title={`${selectedResource?.label ?? detail.resource.id} · ${actions.find((item) => item.value === detail.action)?.label ?? detail.action}`}
          description={`${options.subjectTypes.find((item) => item.value === subject?.type)?.label ?? subject?.type} · ${subject?.id}`}
          onClose={() => setDetail(undefined)}
        >
          <div className='overflow-y-auto p-6'>
            <Decision
              value={detail.decision}
              fields={
                options.collections.find(
                  (item) => item.name === detail.resource.id,
                )?.fields ?? []
              }
            />
          </div>
        </RuleDrawer>
      ) : null}
    </div>
  );
}
