import { useList } from '@refinedev/core';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AccessDenied } from '@/components/access-control/access-denied';
import { CanAccess } from '@/components/access-control/can-access';
import { LoadingState } from '@/components/app-shell/loading-state';
import { DeleteButton } from '@/components/resources/buttons/delete';
import { EditButton } from '@/components/resources/buttons/edit';
import { ShowButton } from '@/components/resources/buttons/show';
import { ListViewHeader } from '@/components/resources/views/list-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FieldValue } from './field-value';
import { toScalarString, type CrmRecord } from './data';
import { getResourceAppends, type CrmResourceConfig } from './resource-config';
import { useCrmResource } from './use-crm-resource';

const PAGE_SIZE = 10;

function EmptyState({ config }: { config: CrmResourceConfig }) {
  return (
    <div className='flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 text-center'>
      <p className='text-base font-semibold'>还没有{config.singular}</p>
      <p className='mt-2 max-w-md text-sm leading-6 text-muted-foreground'>
        创建第一条{config.singular}，记录会保存到当前
        CRM，并由服务端校验操作权限。
      </p>
    </div>
  );
}

function RecordActions({
  config,
  record,
}: {
  config: CrmResourceConfig;
  record: CrmRecord;
}) {
  return (
    <div className='flex items-center justify-end gap-1'>
      <ShowButton
        resource={config.resource}
        recordItemId={record.id}
        variant='ghost'
        size='icon-sm'
        aria-label={`查看${config.singular}`}
      >
        <Eye />
      </ShowButton>
      <EditButton
        resource={config.resource}
        recordItemId={record.id}
        variant='ghost'
        size='icon-sm'
        aria-label={`编辑${config.singular}`}
      >
        <Pencil />
      </EditButton>
      <DeleteButton
        resource={config.resource}
        recordItemId={record.id}
        variant='ghost'
        size='icon-sm'
        aria-label={`删除${config.singular}`}
      >
        <Trash2 />
      </DeleteButton>
    </div>
  );
}

function ResourceTable({
  config,
  records,
}: {
  config: CrmResourceConfig;
  records: CrmRecord[];
}) {
  const columns = config.fields.filter((field) => field.list).slice(0, 6);

  return (
    <>
      <div className='hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/40 hover:bg-muted/40'>
              {columns.map((field) => (
                <TableHead key={field.name}>{field.label}</TableHead>
              ))}
              <TableHead className='w-32 text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                {columns.map((field, index) => (
                  <TableCell
                    key={field.name}
                    className={index === 0 ? 'font-medium' : undefined}
                  >
                    <FieldValue field={field} record={record} />
                  </TableCell>
                ))}
                <TableCell>
                  <RecordActions config={config} record={record} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className='grid gap-3 md:hidden'>
        {records.map((record) => (
          <Card key={record.id}>
            <CardContent className='space-y-4 p-4'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='font-semibold'>
                    {toScalarString(
                      record[config.primaryField],
                      config.singular,
                    )}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    #{record.id}
                  </p>
                </div>
                <RecordActions config={config} record={record} />
              </div>
              <dl className='grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
                {columns.slice(1, 5).map((field) => (
                  <div key={field.name} className='min-w-0'>
                    <dt className='text-xs text-muted-foreground'>
                      {field.label}
                    </dt>
                    <dd className='mt-1 truncate'>
                      <FieldValue field={field} record={record} />
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function CrmResourceList() {
  const config = useCrmResource();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setPage(1), [search, status]);

  const statusField = config?.fields.find(
    (field) => field.name === config.statusField,
  );
  const filters = useMemo(() => {
    if (!config) return [];
    return [
      ...(search.trim()
        ? [
            {
              field: config.searchField,
              operator: 'contains' as const,
              value: search.trim(),
            },
          ]
        : []),
      ...(config.statusField && status
        ? [
            {
              field: config.statusField,
              operator: 'eq' as const,
              value: status,
            },
          ]
        : []),
    ];
  }, [config, search, status]);
  const { result, query } = useList<CrmRecord>({
    resource: config?.resource ?? 'crm_unresolved',
    pagination: { mode: 'server', currentPage: page, pageSize: PAGE_SIZE },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters,
    meta: config ? { appends: getResourceAppends(config) } : undefined,
    queryOptions: { enabled: Boolean(config), retry: false },
  });

  if (!config) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>CRM 路由配置缺失</AlertTitle>
        <AlertDescription>当前路由没有对应的业务资源定义。</AlertDescription>
      </Alert>
    );
  }

  const total = result.total ?? result.data.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <CanAccess
      resource={config.resource}
      action='list'
      fallback={<AccessDenied />}
    >
      <div className='space-y-6'>
        <ListViewHeader resource={config.resource} />

        <div className='flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center'>
          <div className='relative flex-1'>
            <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className='pl-9'
              placeholder={`搜索${config.singular}`}
              aria-label={`搜索${config.singular}`}
            />
          </div>
          {statusField?.options ? (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className='h-10 w-full sm:w-44'>
                <SelectValue placeholder='全部状态' />
              </SelectTrigger>
              <SelectContent align='start'>
                <SelectItem value={null}>全部状态</SelectItem>
                {statusField.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {query.isLoading ? (
          <LoadingState className='min-h-72' />
        ) : query.isError ? (
          <Alert variant='destructive'>
            <AlertTitle>无法加载{config.title}</AlertTitle>
            <AlertDescription>
              CRM 数据服务暂时不可用，请稍后重试或联系管理员。
            </AlertDescription>
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState config={config} />
        ) : (
          <ResourceTable config={config} records={result.data} />
        )}

        {!query.isLoading && !query.isError && total > 0 ? (
          <div className='flex items-center justify-between text-sm text-muted-foreground'>
            <span>共 {total} 条记录</span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='icon-sm'
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label='上一页'
              >
                <ChevronLeft />
              </Button>
              <span className='min-w-16 text-center'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='icon-sm'
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                aria-label='下一页'
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </CanAccess>
  );
}
