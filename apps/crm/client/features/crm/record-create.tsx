import { type HttpError } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { useRouteSurfaceClose } from '@nocobase/app-portal-sdk/routing';

import { AccessDenied } from '@/components/access-control/access-denied';
import { CanAccess } from '@/components/access-control/can-access';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from '@/extensions/nocobase-route-surfaces';
import type { CrmRecord } from './data';
import { normalizeRecordValues } from './data';
import { CrmRecordFormFields, type CrmFormValues } from './record-form';
import { getCrmResource } from './resource-config';
import { useCrmResource } from './use-crm-resource';

function CreateRecordForm({ resourceName }: { resourceName: string }) {
  const config = getCrmResource(resourceName)!;
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<CrmRecord, HttpError, CrmFormValues>({
    refineCoreProps: {
      resource: config.resource,
      action: 'create',
      redirect: false,
      onMutationSuccess: () => {
        void close({ skipBeforeClose: true });
      },
    },
    defaultValues: config.defaultValues,
  });
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          void onFinish(normalizeRecordValues(values, config));
        })}
        className='flex min-h-0 flex-1 flex-col'
      >
        <div className='min-h-0 flex-1 overflow-y-auto px-5 py-5'>
          <CrmRecordFormFields form={form} config={config} />
        </div>
        <RouteDrawerFooter className='flex-row justify-end'>
          <Button type='button' variant='outline' onClick={() => close()}>
            取消
          </Button>
          <Button type='submit' disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? '正在创建...'
              : `创建${config.singular}`}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export default function RecordCreateRoute() {
  const config = useCrmResource();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();

  if (!config) return null;

  return (
    <CanAccess
      resource={config.resource}
      action='create'
      fallback={<AccessDenied />}
    >
      <>
        <RouteDrawer
          title={`新建${config.singular}`}
          description={`填写关键信息并保存到当前 CRM 的${config.title}。`}
          closeLabel='关闭'
          closeTo={config.route}
          beforeClose={beforeClose}
        >
          <CreateRecordForm resourceName={config.resource} />
        </RouteDrawer>
        {confirmation}
      </>
    </CanAccess>
  );
}
