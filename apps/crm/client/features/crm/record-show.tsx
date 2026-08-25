import { useShow } from '@refinedev/core';
import { Pencil, RotateCw } from 'lucide-react';
import { useNavigate, useOutlet, useParams } from 'react-router';

import { AccessDenied } from '@/components/access-control/access-denied';
import { CanAccess } from '@/components/access-control/can-access';
import { LoadingState } from '@/components/app-shell/loading-state';
import { EditButton } from '@/components/resources/buttons/edit';
import { RefreshButton } from '@/components/resources/buttons/refresh';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { RouteDrawer } from '@/extensions/nocobase-route-surfaces';
import { FieldValue } from './field-value';
import type { CrmRecord } from './data';
import { toScalarString } from './data';
import { getResourceAppends } from './resource-config';
import { useCrmResource } from './use-crm-resource';

function RecordShow() {
  const { id } = useParams<{ id: string }>();
  const config = useCrmResource()!;
  const nested = useOutlet();
  const navigate = useNavigate();
  const { result: record, query } = useShow<CrmRecord>({
    resource: config.resource,
    id,
    meta: { appends: getResourceAppends(config) },
  });
  const title = toScalarString(record?.[config.primaryField], config.singular);
  const detailFields = config.fields.filter((field) => field.detail);

  return (
    <RouteDrawer
      title={title}
      description={config.description}
      closeLabel='关闭'
      closeTo={config.route}
      nested={nested}
      actions={
        record ? (
          <>
            <RefreshButton
              resource={config.resource}
              recordItemId={record.id}
              variant='outline'
              size='icon-sm'
              aria-label='刷新'
            >
              <RotateCw />
            </RefreshButton>
            <EditButton
              resource={config.resource}
              recordItemId={record.id}
              variant='outline'
              size='icon-sm'
              aria-label={`编辑${config.singular}`}
              onClick={() => navigate('edit')}
            >
              <Pencil />
            </EditButton>
          </>
        ) : null
      }
    >
      <div className='min-h-0 flex-1 overflow-y-auto px-5 py-5'>
        {query.isLoading ? (
          <LoadingState className='min-h-64' />
        ) : query.isError || !record ? (
          <Alert variant='destructive'>
            <AlertTitle>无法加载{config.singular}</AlertTitle>
            <AlertDescription>
              记录可能已删除，或当前角色没有查看权限。
            </AlertDescription>
          </Alert>
        ) : (
          <div className='space-y-6'>
            <section className='rounded-xl border bg-card p-5'>
              <h3 className='text-sm font-semibold'>业务信息</h3>
              <Separator className='my-4' />
              <dl className='grid gap-x-6 gap-y-5 sm:grid-cols-2'>
                {detailFields.map((field) => (
                  <div
                    key={field.name}
                    className={
                      field.kind === 'textarea' ? 'sm:col-span-2' : undefined
                    }
                  >
                    <dt className='text-xs text-muted-foreground'>
                      {field.label}
                    </dt>
                    <dd className='mt-1.5 text-sm font-medium'>
                      <FieldValue field={field} record={record} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className='grid gap-4 sm:grid-cols-2'>
              <div className='rounded-xl border bg-muted/25 p-4'>
                <p className='text-xs text-muted-foreground'>创建时间</p>
                <p className='mt-1 text-sm font-medium'>
                  {record.createdAt
                    ? new Date(toScalarString(record.createdAt)).toLocaleString(
                        'zh-CN',
                      )
                    : '—'}
                </p>
              </div>
              <div className='rounded-xl border bg-muted/25 p-4'>
                <p className='text-xs text-muted-foreground'>最近更新</p>
                <p className='mt-1 text-sm font-medium'>
                  {record.updatedAt
                    ? new Date(toScalarString(record.updatedAt)).toLocaleString(
                        'zh-CN',
                      )
                    : '—'}
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </RouteDrawer>
  );
}

export default function RecordShowRoute() {
  const config = useCrmResource();
  if (!config) return null;
  return (
    <CanAccess
      resource={config.resource}
      action='show'
      fallback={<AccessDenied />}
    >
      <RecordShow />
    </CanAccess>
  );
}
