import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import {
  AGGREGATE_PATH,
  type AggregateRequest,
  type AggregateResponse,
  type AggregateScalar,
  type AggregateStatus,
} from '../../shared/aggregate.js';
import { detailPath } from '../model.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/select.js';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../components/ui/table.js';

const NS = '@nocobase/app-plugin-repository-example';
const statuses: readonly AggregateStatus[] = [
  'all',
  'draft',
  'confirmed',
  'paid',
  'cancelled',
];
const metrics = [
  'count',
  'quantity',
  'averagePrice',
  'minimumPrice',
  'maximumPrice',
] as const;
export default function AggregatePage(): ReactElement {
  const api = useService(apiClientToken);
  const { t } = useTranslation(NS);
  const [status, setStatus] = useState<AggregateStatus>('all');
  const [minimum, setMinimum] = useState('0');
  const [query, setQuery] = useState<AggregateRequest>({
    status: 'all',
    minimumQuantity: 0,
  });
  const [data, setData] = useState<AggregateResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api
      .request<{ data: AggregateResponse }>({
        path: AGGREGATE_PATH,
        query: { ...query },
      })
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((value: unknown) => {
        if (active)
          setError(value instanceof Error ? value.message : t('loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, query, t]);
  const display = (value: AggregateScalar): string =>
    value === null ? 'NULL' : String(value);
  return (
    <main className='mx-auto max-w-7xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>{t('aggregateTitle')}</h1>
        <p className='text-muted-foreground'>{t('aggregateIntro')}</p>
      </header>
      <form
        className='flex flex-wrap items-end gap-4'
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setError('');
          setQuery({ status, minimumQuantity: Number(minimum) });
        }}
      >
        <label className='space-y-2 text-sm'>
          <span>{t('status')}</span>
          <Select
            value={status}
            items={statuses.map((value) => ({
              value,
              label: t(value === 'all' ? 'aggregateAll' : value),
            }))}
            onValueChange={(value) => {
              if (value) setStatus(value);
            }}
          >
            <SelectTrigger aria-label={t('status')} className='w-48'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(value === 'all' ? 'aggregateAll' : value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className='space-y-2 text-sm'>
          <span>{t('aggregateHaving')}</span>
          <Input
            required
            type='number'
            min={0}
            max={1000000}
            step={1}
            aria-label={t('aggregateHaving')}
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </label>
        <Button type='submit' disabled={loading}>
          {t('aggregateApply')}
        </Button>
      </form>
      {loading && <p role='status'>{t('loading')}</p>}
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}
      {data && !loading && !error && (
        <div className='space-y-6' aria-busy={loading}>
          <section
            className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'
            aria-label={t('aggregateMetrics')}
          >
            {metrics.map((metric) => (
              <Card key={metric}>
                <CardHeader>
                  <CardTitle>{t(`aggregate_${metric}`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <output
                    aria-label={t(`aggregate_${metric}`)}
                    className='text-2xl font-semibold tabular-nums'
                  >
                    {display(data.summary[metric])}
                  </output>
                </CardContent>
              </Card>
            ))}
          </section>
          <p className='text-sm text-muted-foreground'>
            {t('aggregateSemantics')}
          </p>
          <div className='grid gap-6 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('aggregateStatuses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table aria-label={t('aggregateStatuses')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('status')}</TableHead>
                      <TableHead>COUNT(*)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.statuses.map((row) => (
                      <TableRow key={row.status}>
                        <TableCell>{t(row.status)}</TableCell>
                        <TableCell>{display(row.count)}</TableCell>
                      </TableRow>
                    ))}
                    {!data.statuses.length && (
                      <TableRow>
                        <TableCell colSpan={2}>{t('none')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('aggregateCustomers')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='mb-3 text-sm text-muted-foreground'>
                  {t('aggregateCustomerHint', { count: data.customerLimit })}
                </p>
                <Table aria-label={t('aggregateCustomers')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('customer')}</TableHead>
                      <TableHead>COUNT(orders)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.customers.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            className='text-primary hover:underline'
                            to={detailPath('customers', row.id)}
                          >
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell>{row.orders}</TableCell>
                      </TableRow>
                    ))}
                    {!data.customers.length && (
                      <TableRow>
                        <TableCell colSpan={2}>{t('none')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('aggregateProducts')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table aria-label={t('aggregateProducts')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('product')}</TableHead>
                    <TableHead>{t('sku')}</TableHead>
                    <TableHead>COUNT(*)</TableHead>
                    <TableHead>SUM(quantity)</TableHead>
                    <TableHead>AVG(price)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.products.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>
                        <Link
                          className='text-primary hover:underline'
                          to={detailPath('products', row.productId)}
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.sku}</TableCell>
                      <TableCell>{display(row.count)}</TableCell>
                      <TableCell>{display(row.quantity)}</TableCell>
                      <TableCell>{display(row.averagePrice)}</TableCell>
                    </TableRow>
                  ))}
                  {!data.products.length && (
                    <TableRow>
                      <TableCell colSpan={5}>{t('none')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
      <details className='rounded-lg border p-4'>
        <summary className='cursor-pointer font-medium'>{t('trace')}</summary>
        <p className='my-3 text-sm text-muted-foreground'>
          {t('aggregateTraceHint')}
        </p>
        <div className='grid gap-4 md:grid-cols-2'>
          <section>
            <h3>{t('request')}</h3>
            <pre className='overflow-auto text-xs'>
              {JSON.stringify(
                { method: 'GET', path: AGGREGATE_PATH, query },
                null,
                2,
              )}
            </pre>
          </section>
          <section>
            <h3>{t('response')}</h3>
            <pre className='max-h-96 overflow-auto text-xs'>
              {JSON.stringify(
                loading ? null : error ? { error } : (data ?? null),
                null,
                2,
              )}
            </pre>
          </section>
        </div>
      </details>
    </main>
  );
}
