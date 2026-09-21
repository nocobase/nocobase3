import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  CopyIcon,
  EyeIcon,
  MoreHorizontalIcon,
  TruckIcon,
  XCircleIcon,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

import { ExamplePage, ExampleSection } from '../shared';

type OrderStatus =
  'paid' | 'pending' | 'processing' | 'shipped' | 'cancelled' | 'refunded';

interface Order {
  readonly id: string;
  readonly number: string;
  readonly customer: string;
  readonly email: string;
  readonly status: OrderStatus;
  readonly amount: number;
  readonly placedAt: string;
}

/** Mock rows for the table. Nothing here reaches a server. */
const ORDERS: Order[] = [
  {
    id: '1',
    number: 'ORD-1042',
    customer: 'Ava Chen',
    email: 'ava.chen@northwind.example',
    status: 'paid',
    amount: 1240,
    placedAt: '2026-09-18',
  },
  {
    id: '2',
    number: 'ORD-1041',
    customer: 'Liam Patel',
    email: 'liam.patel@acme.example',
    status: 'processing',
    amount: 389.5,
    placedAt: '2026-09-18',
  },
  {
    id: '3',
    number: 'ORD-1040',
    customer: 'Noah Fischer',
    email: 'noah.fischer@globex.example',
    status: 'shipped',
    amount: 2150,
    placedAt: '2026-09-17',
  },
  {
    id: '4',
    number: 'ORD-1039',
    customer: 'Mia Rossi',
    email: 'mia.rossi@initech.example',
    status: 'pending',
    amount: 96,
    placedAt: '2026-09-17',
  },
  {
    id: '5',
    number: 'ORD-1038',
    customer: 'Ethan Novak',
    email: 'ethan.novak@umbrella.example',
    status: 'cancelled',
    amount: 540,
    placedAt: '2026-09-16',
  },
  {
    id: '6',
    number: 'ORD-1037',
    customer: 'Sofia Alvarez',
    email: 'sofia.alvarez@stark.example',
    status: 'paid',
    amount: 1780.25,
    placedAt: '2026-09-16',
  },
  {
    id: '7',
    number: 'ORD-1036',
    customer: 'Lucas Meyer',
    email: 'lucas.meyer@wayne.example',
    status: 'refunded',
    amount: 210,
    placedAt: '2026-09-15',
  },
  {
    id: '8',
    number: 'ORD-1035',
    customer: 'Emma Dubois',
    email: 'emma.dubois@hooli.example',
    status: 'shipped',
    amount: 3320,
    placedAt: '2026-09-15',
  },
  {
    id: '9',
    number: 'ORD-1034',
    customer: 'Oliver Kim',
    email: 'oliver.kim@vandelay.example',
    status: 'paid',
    amount: 455,
    placedAt: '2026-09-14',
  },
  {
    id: '10',
    number: 'ORD-1033',
    customer: 'Isabella Costa',
    email: 'isabella.costa@soylent.example',
    status: 'processing',
    amount: 899.99,
    placedAt: '2026-09-13',
  },
  {
    id: '11',
    number: 'ORD-1032',
    customer: 'Henry Walsh',
    email: 'henry.walsh@massive.example',
    status: 'pending',
    amount: 128,
    placedAt: '2026-09-12',
  },
  {
    id: '12',
    number: 'ORD-1031',
    customer: 'Chloe Martin',
    email: 'chloe.martin@tyrell.example',
    status: 'paid',
    amount: 2640,
    placedAt: '2026-09-11',
  },
  {
    id: '13',
    number: 'ORD-1030',
    customer: 'Daniel Okafor',
    email: 'daniel.okafor@cyberdyne.example',
    status: 'shipped',
    amount: 715.4,
    placedAt: '2026-09-10',
  },
  {
    id: '14',
    number: 'ORD-1029',
    customer: 'Grace Lindqvist',
    email: 'grace.lindqvist@aperture.example',
    status: 'cancelled',
    amount: 62,
    placedAt: '2026-09-09',
  },
  {
    id: '15',
    number: 'ORD-1028',
    customer: 'Mateo Silva',
    email: 'mateo.silva@monarch.example',
    status: 'paid',
    amount: 1905,
    placedAt: '2026-09-08',
  },
];

const STATUS_BADGE: Record<
  OrderStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  paid: 'default',
  pending: 'outline',
  processing: 'secondary',
  shipped: 'secondary',
  cancelled: 'destructive',
  refunded: 'destructive',
};

const STATUS_KEY: Record<OrderStatus, string> = {
  paid: 'devCommon.statusPaid',
  pending: 'devCommon.statusPending',
  processing: 'devCommon.statusProcessing',
  shipped: 'devCommon.statusShipped',
  cancelled: 'devCommon.statusCancelled',
  refunded: 'devCommon.statusRefunded',
};

export default function DataTableExamplePage(): ReactElement {
  const { t, i18n } = useTranslation();
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'USD',
      }),
    [i18n.language],
  );

  const columnLabels: Partial<Record<string, string>> = {
    number: t('devComponents.dataTable.orderNumber'),
    customer: t('devCommon.customer'),
    status: t('devCommon.status'),
    amount: t('devCommon.amount'),
    placedAt: t('devCommon.date'),
  };

  // Column definitions read `t`, so they live in the component; `useMemo`
  // keeps their identity stable between renders for TanStack Table.
  const baseColumns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devComponents.dataTable.orderNumber')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.number}</span>
        ),
      },
      {
        accessorKey: 'customer',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devCommon.customer')}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-0 leading-tight'>
            <div className='truncate font-medium'>{row.original.customer}</div>
            <div className='truncate text-xs text-muted-foreground'>
              {row.original.email}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devCommon.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {t(STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devCommon.amount')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className='text-right font-medium tabular-nums'>
            {currency.format(row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: 'placedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('devCommon.date')} />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {format(new Date(row.original.placedAt), 'PP')}
          </span>
        ),
      },
    ],
    [t, currency],
  );

  const columns = useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={
              table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected()
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked)
            }
            aria-label={t('devComponents.dataTable.selectAll')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
            aria-label={t('devComponents.dataTable.selectRow')}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...baseColumns,
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className='text-right'>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('devCommon.actions')}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuLabel>{order.number}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() =>
                      setLastAction(
                        `${t('devComponents.dataTable.viewDetails')} · ${order.number}`,
                      )
                    }
                  >
                    <EyeIcon />
                    {t('devComponents.dataTable.viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void navigator.clipboard.writeText(order.number);
                      setLastAction(
                        `${t('devCommon.copied')} · ${order.number}`,
                      );
                    }}
                  >
                    <CopyIcon />
                    {t('devComponents.dataTable.copyNumber')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={order.status !== 'processing'}
                    onClick={() =>
                      setLastAction(
                        `${t('devComponents.dataTable.markShipped')} · ${order.number}`,
                      )
                    }
                  >
                    <TruckIcon />
                    {t('devComponents.dataTable.markShipped')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    disabled={
                      order.status === 'cancelled' ||
                      order.status === 'refunded' ||
                      order.status === 'shipped'
                    }
                    onClick={() =>
                      setLastAction(
                        `${t('devComponents.dataTable.cancelOrder')} · ${order.number}`,
                      )
                    }
                  >
                    <XCircleIcon />
                    {t('devComponents.dataTable.cancelOrder')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t, baseColumns],
  );

  const compactColumns = useMemo(() => baseColumns.slice(0, 4), [baseColumns]);

  return (
    <ExamplePage
      title={t('devComponents.dataTable.title')}
      description={t('devComponents.dataTable.description')}
      source='client/pages/dev/components/data-table.tsx'
      docs='https://ui.shadcn.com/docs/components/data-table'
    >
      <ExampleSection
        title={t('devComponents.dataTable.full')}
        description={t('devComponents.dataTable.fullDescription')}
        contentClassName='block'
      >
        <DataTable
          columns={columns}
          data={ORDERS}
          pageSize={5}
          pageSizeOptions={[5, 10, 15]}
          getRowId={(order) => order.id}
          toolbar={(table) => {
            const filter = table.getColumn('customer')?.getFilterValue();
            return (
              <>
                <Input
                  placeholder={t('devComponents.dataTable.filterPlaceholder')}
                  value={typeof filter === 'string' ? filter : ''}
                  onChange={(event) =>
                    table
                      .getColumn('customer')
                      ?.setFilterValue(event.target.value)
                  }
                  className='max-w-xs'
                />
                <DataTableViewOptions
                  table={table}
                  getColumnLabel={(column) =>
                    columnLabels[column.id] ?? column.id
                  }
                />
              </>
            );
          }}
        />
        <p className='mt-3 text-sm text-muted-foreground'>
          {lastAction
            ? t('devComponents.dataTable.lastAction', { action: lastAction })
            : t('devComponents.dataTable.noAction')}
        </p>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.dataTable.compact')}
        description={t('devComponents.dataTable.compactDescription')}
        contentClassName='block'
      >
        <DataTable
          columns={compactColumns}
          data={ORDERS.slice(0, 5)}
          pagination={false}
          getRowId={(order) => order.id}
          onRowClick={(row) => setSelectedOrder(row.original)}
        />
        <p className='mt-3 text-sm text-muted-foreground'>
          {selectedOrder
            ? t('devComponents.dataTable.selectedOrder', {
                number: selectedOrder.number,
                customer: selectedOrder.customer,
              })
            : t('devComponents.dataTable.clickRow')}
        </p>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.dataTable.empty')}
        description={t('devComponents.dataTable.emptyDescription')}
        contentClassName='block'
      >
        <DataTable
          columns={compactColumns}
          data={[]}
          pagination={false}
          emptyMessage={t('devComponents.dataTable.noOrders')}
        />
      </ExampleSection>
    </ExamplePage>
  );
}
