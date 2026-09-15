import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Reads the external CRM through the read-only repository routes in
 * `server/routes/external-crm.ts`. Everything here is addressed by logical
 * name — `orders`, `customer`, `orderNo` — even though the CRM's tables are
 * `crm_orders` and `crm_customers`: the connection's naming and the metadata
 * in `database/externalCrm/collections` do the mapping on the server.
 */
const statuses = ['all', 'paid', 'shipped', 'draft'] as const;
type Status = (typeof statuses)[number];

interface CrmOrder {
  id: number;
  orderNo: string;
  status: string;
  totalAmount: string | number;
  placedAt: string;
  customer: { id: number; displayName: string; email: string } | null;
}

export default function ExternalCrmPage(): ReactElement {
  const api = useService(apiClientToken);
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status>('all');
  const orders = useQuery({
    queryKey: ['external-crm', 'orders', status],
    queryFn: ({ signal }) =>
      api.request<{ data: CrmOrder[] }>({
        path: 'crmOrders:findMany',
        method: 'POST',
        json: {
          ...(status === 'all' ? {} : { filter: { status } }),
          sort: {
            kind: 'sort',
            version: 1,
            items: [{ kind: 'field', path: ['placedAt'], direction: 'desc' }],
          },
          select: {
            kind: 'select',
            version: 1,
            root: {
              kind: 'selection',
              fields: ['id', 'orderNo', 'status', 'totalAmount', 'placedAt'],
              includes: [
                {
                  kind: 'include',
                  relation: 'customer',
                  select: {
                    kind: 'selection',
                    fields: ['id', 'displayName', 'email'],
                  },
                },
              ],
            },
          },
        },
        signal,
      }),
    retry: false,
  });
  const customers = useQuery({
    queryKey: ['external-crm', 'customers', 'count'],
    queryFn: ({ signal }) =>
      api.request<{ data: number }>({
        path: 'crmCustomers:count',
        method: 'POST',
        json: {},
        signal,
      }),
    retry: false,
  });
  const date = (value: string): string =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  const amount = (value: string | number): string =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  const rows = orders.data?.data ?? [];
  return (
    <PageContainer>
      <PageHeader
        description={t('externalCrm.description')}
        title={t('externalCrm.title')}
      />
      <div className='flex flex-wrap gap-2'>
        <Badge variant='outline'>{t('externalCrm.readOnly')}</Badge>
        {customers.data && (
          <Badge variant='secondary'>
            {t('externalCrm.customers', { count: customers.data.data })}
          </Badge>
        )}
      </div>
      <div className='flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4'>
        <div
          className='flex flex-wrap gap-2'
          role='group'
          aria-label={t('externalCrm.filter')}
        >
          {statuses.map((value) => (
            <Button
              key={value}
              variant={status === value ? 'secondary' : 'ghost'}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {t(`externalCrm.status.${value}`)}
            </Button>
          ))}
        </div>
        <Button
          variant='outline'
          disabled={orders.isFetching}
          onClick={() => void orders.refetch()}
        >
          <RefreshCw className='size-4' />
          {t('externalCrm.refresh')}
        </Button>
      </div>
      {orders.isPending ? (
        <p role='status' className='py-12 text-center text-muted-foreground'>
          {t('externalCrm.loading')}
        </p>
      ) : orders.isError ? (
        <div
          role='alert'
          className='space-y-3 rounded-xl border p-8 text-center'
        >
          <p>{t('externalCrm.loadError')}</p>
          <Button variant='outline' onClick={() => void orders.refetch()}>
            {t('externalCrm.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className='space-y-3 rounded-xl border border-dashed py-16 text-center'>
          <Plug className='mx-auto size-8 text-muted-foreground' />
          <h2 className='font-semibold'>{t('externalCrm.empty')}</h2>
          <p className='text-sm text-muted-foreground'>
            {t('externalCrm.emptyHint')}
          </p>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-xl border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('externalCrm.columns.orderNo')}</TableHead>
                <TableHead>{t('externalCrm.columns.customer')}</TableHead>
                <TableHead>{t('externalCrm.columns.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('externalCrm.columns.totalAmount')}
                </TableHead>
                <TableHead>{t('externalCrm.columns.placedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className='font-medium'>{order.orderNo}</TableCell>
                  <TableCell>
                    {order.customer ? (
                      <div className='space-y-0.5'>
                        <div>{order.customer.displayName}</div>
                        <div className='text-xs text-muted-foreground'>
                          {order.customer.email}
                        </div>
                      </div>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.status === 'paid' ? 'default' : 'secondary'
                      }
                    >
                      {statuses.includes(order.status as Status)
                        ? t(`externalCrm.status.${order.status as Status}`)
                        : order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {amount(order.totalAmount)}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {date(order.placedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className='text-sm text-muted-foreground'>{t('externalCrm.note')}</p>
    </PageContainer>
  );
}
