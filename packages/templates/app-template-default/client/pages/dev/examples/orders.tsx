import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PlusIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { DateRange } from 'react-day-picker';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { DateRangePicker } from '@/components/date-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster, toast } from '@/components/ui/toast';

import { ExamplePage } from '../shared';
import {
  ORDERS,
  ORDER_STATUSES,
  orderTotal,
  type Order,
  type OrderChannel,
  type OrderStatus,
} from './orders.data';

type StatusTab = 'all' | OrderStatus;

const STATUS_BADGE: Record<
  OrderStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  shipped: 'secondary',
  completed: 'default',
  cancelled: 'destructive',
  refunded: 'destructive',
};

const CHANNELS: readonly OrderChannel[] = ['web', 'store', 'phone'];

function formValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function inRange(iso: string, range: DateRange | undefined): boolean {
  if (!range?.from) return true;
  const day = new Date(iso);
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to ?? range.from);
  to.setHours(23, 59, 59, 999);
  return day >= from && day <= to;
}

interface StatCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly delta: number;
  readonly hint: ReactNode;
}

function StatCard({ label, value, delta, hint }: StatCardProps): ReactElement {
  const up = delta >= 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='font-heading text-2xl tabular-nums'>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex items-center gap-2 text-sm'>
        <Badge variant={up ? 'secondary' : 'destructive'}>
          <Icon />
          {up ? '+' : ''}
          {delta}%
        </Badge>
        <span className='text-muted-foreground'>{hint}</span>
      </CardContent>
    </Card>
  );
}

export default function OrdersExamplePage(): ReactElement {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<readonly Order[]>(ORDERS);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [detail, setDetail] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const statusLabel = useCallback(
    (status: OrderStatus): string => t(`devExamples.orders.status.${status}`),
    [t],
  );

  const visible = useMemo(
    () =>
      rows.filter(
        (order) =>
          (statusTab === 'all' || order.status === statusTab) &&
          inRange(order.placedAt, range),
      ),
    [rows, statusTab, range],
  );

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = {
      all: rows.length,
      pending: 0,
      processing: 0,
      shipped: 0,
      completed: 0,
      cancelled: 0,
      refunded: 0,
    };
    for (const order of rows) result[order.status] += 1;
    return result;
  }, [rows]);

  const revenue = rows
    .filter(
      (order) => order.status === 'completed' || order.status === 'shipped',
    )
    .reduce((sum, order) => sum + orderTotal(order), 0);
  const averageOrder = rows.length > 0 ? revenue / rows.length : 0;

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
            aria-label={t('devExamples.orders.selectAll')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
            aria-label={t('devExamples.orders.selectRow')}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'number',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devExamples.orders.columns.number')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.number}</span>
        ),
      },
      {
        id: 'customer',
        accessorFn: (order) => `${order.customer.name} ${order.customer.email}`,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devExamples.orders.columns.customer')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex items-center gap-3'>
            <Avatar size='sm'>
              <AvatarFallback>{row.original.customer.initials}</AvatarFallback>
            </Avatar>
            <div className='min-w-0 leading-tight'>
              <div className='truncate font-medium'>
                {row.original.customer.name}
              </div>
              <div className='truncate text-xs text-muted-foreground'>
                {row.original.customer.email}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devExamples.orders.columns.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_BADGE[row.original.status]}>
            {statusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: 'channel',
        header: t('devExamples.orders.columns.channel'),
        cell: ({ row }) =>
          t(`devExamples.orders.channel.${row.original.channel}`),
      },
      {
        id: 'items',
        accessorFn: (order) =>
          order.lines.reduce((sum, line) => sum + line.quantity, 0),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devExamples.orders.columns.items')}
            className='justify-end'
          />
        ),
        cell: ({ getValue }) => (
          <div className='text-right tabular-nums'>{getValue<number>()}</div>
        ),
      },
      {
        id: 'total',
        accessorFn: (order) => orderTotal(order),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devExamples.orders.columns.total')}
            className='justify-end'
          />
        ),
        cell: ({ getValue }) => (
          <div className='text-right font-medium tabular-nums'>
            {currency.format(getValue<number>())}
          </div>
        ),
      },
      {
        accessorKey: 'placedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devExamples.orders.columns.placedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {format(new Date(row.original.placedAt), 'PP')}
          </span>
        ),
      },
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
                  <DropdownMenuLabel>
                    {t('devCommon.actions')}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setDetail(order)}>
                    <EyeIcon />
                    {t('devExamples.orders.viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void navigator.clipboard.writeText(order.number);
                      toast.add({
                        type: 'success',
                        title: t('devCommon.copied'),
                        description: order.number,
                      });
                    }}
                  >
                    <CopyIcon />
                    {t('devExamples.orders.copyNumber')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    disabled={
                      order.status === 'cancelled' ||
                      order.status === 'refunded' ||
                      order.status === 'completed'
                    }
                    onClick={() => setCancelling(order)}
                  >
                    <XCircleIcon />
                    {t('devExamples.orders.cancelOrder')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t, currency, statusLabel],
  );

  const confirmCancel = (): void => {
    if (!cancelling) return;
    const target = cancelling;
    setRows((current) =>
      current.map((order) =>
        order.id === target.id ? { ...order, status: 'cancelled' } : order,
      ),
    );
    setCancelling(null);
    toast.add({
      type: 'success',
      title: t('devExamples.orders.cancelled'),
      description: target.number,
    });
  };

  const submitNewOrder = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = formValue(data, 'customer');
    const email = formValue(data, 'email');
    const channel = (formValue(data, 'channel') || 'web') as OrderChannel;
    const amount = Number(formValue(data, 'amount'));
    if (!name || !email || !Number.isFinite(amount) || amount <= 0) return;
    const sequence = 1000 + rows.length + 1;
    const order: Order = {
      id: `ord_${sequence}`,
      number: `SO-2026-${sequence}`,
      customer: {
        name,
        email,
        initials: name.slice(0, 2).toUpperCase(),
      },
      status: 'pending',
      channel,
      placedAt: new Date().toISOString(),
      lines: [
        {
          sku: 'MANUAL',
          product: t('devExamples.orders.manualLine'),
          quantity: 1,
          unitPrice: amount,
        },
      ],
    };
    setRows((current) => [order, ...current]);
    setCreating(false);
    toast.add({
      type: 'success',
      title: t('devExamples.orders.created'),
      description: order.number,
    });
  };

  return (
    <ExamplePage
      title={t('devExamples.orders.title')}
      description={t('devExamples.orders.description')}
      source='client/pages/dev/examples/orders.tsx'
      actions={
        <>
          <Button variant='outline'>
            <DownloadIcon data-icon='inline-start' />
            {t('devCommon.export')}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon data-icon='inline-start' />
            {t('devExamples.orders.newOrder')}
          </Button>
        </>
      }
    >
      <Toaster />

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label={t('devExamples.orders.stats.orders')}
          value={counts.all}
          delta={12}
          hint={t('devExamples.orders.stats.versusLastMonth')}
        />
        <StatCard
          label={t('devExamples.orders.stats.revenue')}
          value={currency.format(revenue)}
          delta={8}
          hint={t('devExamples.orders.stats.versusLastMonth')}
        />
        <StatCard
          label={t('devExamples.orders.stats.averageOrder')}
          value={currency.format(averageOrder)}
          delta={-3}
          hint={t('devExamples.orders.stats.versusLastMonth')}
        />
        <StatCard
          label={t('devExamples.orders.stats.awaitingAction')}
          value={counts.pending + counts.processing}
          delta={4}
          hint={t('devExamples.orders.stats.needsFulfilment')}
        />
      </div>

      <div className='space-y-4'>
        <Tabs
          value={statusTab}
          onValueChange={(value) => setStatusTab(value as StatusTab)}
        >
          <TabsList variant='line' className='w-full justify-start'>
            {(['all', ...ORDER_STATUSES] as const).map((status) => (
              <TabsTrigger key={status} value={status}>
                {status === 'all' ? t('devCommon.all') : statusLabel(status)}
                <Badge variant='secondary' className='tabular-nums'>
                  {counts[status]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <DataTable
          columns={columns}
          data={visible}
          pageSize={10}
          getRowId={(order) => order.id}
          emptyMessage={t('devExamples.orders.empty')}
          toolbar={(table) => (
            <>
              <Input
                placeholder={t('devExamples.orders.searchCustomer')}
                value={
                  (table.getColumn('customer')?.getFilterValue() as
                    string | undefined) ?? ''
                }
                onChange={(event) =>
                  table
                    .getColumn('customer')
                    ?.setFilterValue(event.target.value)
                }
                className='max-w-xs'
              />
              <DateRangePicker
                value={range}
                onChange={setRange}
                placeholder={t('devExamples.orders.anyDate')}
                className='w-64'
              />
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`devExamples.orders.columns.${column.id}`)
                }
              />
            </>
          )}
        />
      </div>

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle className='font-mono'>{detail.number}</SheetTitle>
                <SheetDescription>
                  {format(new Date(detail.placedAt), 'PPp')} ·{' '}
                  {t(`devExamples.orders.channel.${detail.channel}`)}
                </SheetDescription>
              </SheetHeader>
              <div className='flex flex-1 flex-col gap-6 overflow-y-auto px-4'>
                <div className='flex items-center gap-3'>
                  <Avatar>
                    <AvatarFallback>{detail.customer.initials}</AvatarFallback>
                  </Avatar>
                  <div className='min-w-0 leading-tight'>
                    <div className='font-medium'>{detail.customer.name}</div>
                    <div className='truncate text-xs text-muted-foreground'>
                      {detail.customer.email}
                    </div>
                  </div>
                  <Badge
                    variant={STATUS_BADGE[detail.status]}
                    className='ml-auto'
                  >
                    {statusLabel(detail.status)}
                  </Badge>
                </div>
                <Separator />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('devCommon.product')}</TableHead>
                      <TableHead className='text-right'>
                        {t('devCommon.quantity')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('devCommon.amount')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lines.map((line) => (
                      <TableRow key={line.sku}>
                        <TableCell>
                          <div className='font-medium'>{line.product}</div>
                          <div className='font-mono text-xs text-muted-foreground'>
                            {line.sku}
                          </div>
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {line.quantity}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {currency.format(line.quantity * line.unitPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>{t('devCommon.total')}</TableCell>
                      <TableCell className='text-right font-medium tabular-nums'>
                        {currency.format(orderTotal(detail))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('devExamples.orders.cancelTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('devExamples.orders.cancelDescription', {
                number: cancelling?.number ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('devCommon.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={confirmCancel}>
              {t('devExamples.orders.cancelOrder')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={submitNewOrder}>
            <DialogHeader>
              <DialogTitle>{t('devExamples.orders.newOrder')}</DialogTitle>
              <DialogDescription>
                {t('devExamples.orders.newOrderDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='order-customer'>
                  {t('devCommon.customer')}
                </FieldLabel>
                <Input id='order-customer' name='customer' required />
              </Field>
              <Field>
                <FieldLabel htmlFor='order-email'>
                  {t('devCommon.email')}
                </FieldLabel>
                <Input id='order-email' name='email' type='email' required />
              </Field>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor='order-channel'>
                    {t('devExamples.orders.columns.channel')}
                  </FieldLabel>
                  <Select name='channel' defaultValue='web'>
                    <SelectTrigger id='order-channel' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {t(`devExamples.orders.channel.${channel}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor='order-amount'>
                    {t('devCommon.amount')}
                  </FieldLabel>
                  <Input
                    id='order-amount'
                    name='amount'
                    type='number'
                    min={1}
                    step={1}
                    required
                  />
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('devCommon.cancel')}
              </Button>
              <Button type='submit'>{t('devCommon.create')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ExamplePage>
  );
}
