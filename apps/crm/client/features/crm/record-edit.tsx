import { type HttpError, useOne } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { useParams } from 'react-router';
import { useRouteSurfaceClose } from '@nocobase/portal-sdk/routing';

import { AccessDenied } from '@/components/access-control/access-denied';
import { CanAccess } from '@/components/access-control/can-access';
import { LoadingState } from '@/components/app-shell/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from '@/extensions/nocobase-route-surfaces';
import { normalizeRecordValues, type CrmRecord } from './data';
import { CrmRecordFormFields, type CrmFormValues } from './record-form';
import { getCrmResource, getResourceAppends } from './resource-config';
import { useCrmFormHydration } from './use-crm-form-hydration';
import { useCrmResource } from './use-crm-resource';

function EditRecordForm({
  resourceName,
  id,
}: {
  resourceName: string;
  id?: string;
}) {
  const config = getCrmResource(resourceName)!;
  const close = useRouteSurfaceClose();
  const { result: record, query } = useOne<CrmRecord>({
    resource: config.resource,
    id,
    meta: { appends: getResourceAppends(config) },
  });
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<CrmRecord, HttpError, CrmFormValues>({
    refineCoreProps: {
      resource: config.resource,
      action: 'edit',
      id,
      redirect: false,
      queryOptions: { enabled: false },
      onMutationSuccess: () => {
        void close({ skipBeforeClose: true });
      },
    },
    defaultValues: config.defaultValues,
  });

  useCrmFormHydration({ form, id, record });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          void onFinish(normalizeRecordValues(values, config));
        })}
        className='flex min-h-0 flex-1 flex-col'
      >
        <div className='min-h-0 flex-1 overflow-y-auto px-5 py-5'>
          {query.isLoading ? (
            <LoadingState className='min-h-64' />
          ) : query.isError || !record ? (
            <Alert variant='destructive'>
              <AlertTitle>无法加载{config.singular}</AlertTitle>
              <AlertDescription>
                记录可能已删除，或当前角色没有读取权限。
              </AlertDescription>
            </Alert>
          ) : (
            <CrmRecordFormFields
              form={form}
              config={config}
              initialRecord={record}
            />
          )}
        </div>
        <RouteDrawerFooter className='flex-row justify-end'>
          <Button type='button' variant='outline' onClick={() => close()}>
            取消
          </Button>
          <Button
            type='submit'
            disabled={
              query.isLoading || query.isError || form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting ? '正在保存...' : '保存修改'}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

function RecordEditRoute({ returnTo }: { returnTo: 'list' | 'show' }) {
  const { id } = useParams<{ id: string }>();
  const config = useCrmResource();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();

  if (!config) return null;

  return (
    <CanAccess
      resource={config.resource}
      action='edit'
      fallback={<AccessDenied />}
    >
      <>
        <RouteDrawer
          title={`编辑${config.singular}`}
          description={`更新${config.singular}信息，服务端会校验当前账号的操作权限和字段内容。`}
          closeLabel='关闭'
          closeTo={
            returnTo === 'show' && id
              ? `${config.route}/show/${id}`
              : config.route
          }
          beforeClose={beforeClose}
        >
          <EditRecordForm resourceName={config.resource} id={id} />
        </RouteDrawer>
        {confirmation}
      </>
    </CanAccess>
  );
}

export default function RecordEditListRoute() {
  return <RecordEditRoute returnTo='list' />;
}

export function RecordShowEditRoute() {
  return <RecordEditRoute returnTo='show' />;
}
