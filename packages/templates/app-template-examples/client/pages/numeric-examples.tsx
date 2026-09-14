import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type NumericValue = string | number | null;
const fields = [
  ['id', 'increments'],
  ['integerValue', 'INTEGER'],
  ['bigintValue', 'BIGINT'],
  ['decimalValue', 'DECIMAL(30,6)'],
  ['floatValue', 'FLOAT'],
  ['doubleValue', 'DOUBLE'],
] as const;
const sortFields = fields;
const operations = ['count', 'sum', 'avg', 'min', 'max'] as const;
type Field = (typeof fields)[number][0];
type Operation = (typeof operations)[number];
interface NumericExamplesResponse {
  data: {
    dialect: string;
    rows: (Record<Field, NumericValue> & { sample: string })[];
    aggregates: (Record<Operation, NumericValue> & { field: Field })[];
  };
}

function Value({ value }: { value: NumericValue }): ReactElement {
  return (
    <div className='space-y-1'>
      <code className='whitespace-nowrap text-sm tabular-nums'>
        {JSON.stringify(value)}
      </code>
      <div>
        <Badge variant='secondary'>
          {value === null ? 'null' : typeof value}
        </Badge>
      </div>
    </div>
  );
}

export default function NumericExamplesPage(): ReactElement {
  const api = useService(apiClientToken);
  const { t } = useTranslation();
  const [source, setSource] = useState<'query' | 'repository'>('query');
  const [sample, setSample] = useState<'all' | 'null' | 'empty'>('all');
  const [sortField, setSortField] = useState<Field>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['numeric-examples', source, sample, sortField, sortDirection],
    queryFn: ({ signal }) =>
      api.request<NumericExamplesResponse>({
        path: 'numeric-examples',
        query: { source, sample, sortField, sortDirection },
        signal,
      }),
    retry: false,
  });
  return (
    <section className='mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8'>
      <header className='space-y-3'>
        <h1 className='font-heading text-3xl font-semibold tracking-tight'>
          {t('numbers.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('numbers.description')}
        </p>
        {data && (
          <Badge variant='outline'>
            {t('numbers.database', { dialect: data.data.dialect })}
          </Badge>
        )}
      </header>
      <div className='flex flex-wrap items-end gap-6 rounded-xl border bg-card p-4'>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>{t('numbers.source')}</legend>
          <div className='flex gap-2'>
            {(['query', 'repository'] as const).map((item) => (
              <Button
                key={item}
                variant={source === item ? 'default' : 'outline'}
                aria-pressed={source === item}
                onClick={() => setSource(item)}
              >
                {item === 'query' ? 'Query' : 'Repository'}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>{t('numbers.sample')}</legend>
          <div className='flex flex-wrap gap-2'>
            {(
              [
                ['all', 'all'],
                ['null', 'nullOnly'],
                ['empty', 'emptyOnly'],
              ] as const
            ).map(([item, label]) => (
              <Button
                key={item}
                variant={sample === item ? 'default' : 'outline'}
                aria-pressed={sample === item}
                onClick={() => setSample(item)}
              >
                {t(`numbers.${label}`)}
              </Button>
            ))}
          </div>
        </fieldset>
        <Button
          variant='outline'
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className='size-4' />
          {t('numbers.refresh')}
        </Button>
      </div>
      <div className='flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4'>
        <label className='space-y-2 text-sm font-medium'>
          <span className='block'>{t('numbers.sort')}</span>
          <select
            className='h-9 rounded-md border bg-background px-3 font-mono text-sm'
            value={sortField}
            onChange={(event) => setSortField(event.target.value as Field)}
          >
            {sortFields.map(([field, type]) => (
              <option key={field} value={field}>
                {type} ({field})
              </option>
            ))}
          </select>
        </label>
        <div className='flex gap-2'>
          {(['asc', 'desc'] as const).map((direction) => (
            <Button
              key={direction}
              variant={sortDirection === direction ? 'default' : 'outline'}
              aria-pressed={sortDirection === direction}
              onClick={() => setSortDirection(direction)}
            >
              {t(`numbers.${direction}`)}
            </Button>
          ))}
        </div>
        <p className='text-sm text-muted-foreground'>{t('numbers.sortNote')}</p>
      </div>
      <p className='text-sm text-muted-foreground'>{t('numbers.legend')}</p>
      {isPending && <p role='status'>{t('numbers.loading')}</p>}
      {isError && (
        <div role='alert' className='space-y-3 rounded-lg border p-4'>
          <p>{t('numbers.error')}</p>
          <Button variant='outline' onClick={() => void refetch()}>
            {t('numbers.retry')}
          </Button>
        </div>
      )}
      {data && (
        <>
          <section className='space-y-3' aria-labelledby='numeric-rows-heading'>
            <h2
              id='numeric-rows-heading'
              className='font-heading text-xl font-semibold'
            >
              {t('numbers.rows')}
            </h2>
            <div className='rounded-xl border bg-card p-4'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('numbers.scenario')}</TableHead>
                    {fields.map(([field, type]) => (
                      <TableHead key={field}>
                        <code>{type}</code>
                        <div className='text-xs text-muted-foreground'>
                          {field}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>{t('numbers.empty')}</TableCell>
                    </TableRow>
                  ) : (
                    data.data.rows.map((row) => (
                      <TableRow key={row.sample}>
                        <TableCell>
                          {t(`numbers.samples.${row.sample}`, {
                            defaultValue: row.sample,
                          })}
                        </TableCell>
                        {fields.map(([field]) => (
                          <TableCell key={field}>
                            <Value value={row[field]} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className='text-sm text-muted-foreground'>
              {t('numbers.idNote')}
            </p>
          </section>
          <section
            className='space-y-3'
            aria-labelledby='numeric-aggregates-heading'
          >
            <h2
              id='numeric-aggregates-heading'
              className='font-heading text-xl font-semibold'
            >
              {t('numbers.aggregates')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('numbers.aggregateNote')}
            </p>
            <div className='rounded-xl border bg-card p-4'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('numbers.field')}</TableHead>
                    {operations.map((op) => (
                      <TableHead key={op}>
                        <code>{op.toUpperCase()}</code>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.aggregates.map((row) => (
                    <TableRow key={row.field}>
                      <TableCell>
                        <code>
                          {fields.find(([field]) => field === row.field)?.[1]}
                        </code>
                        <div className='text-xs text-muted-foreground'>
                          {row.field}
                        </div>
                      </TableCell>
                      {operations.map((op) => (
                        <TableCell key={op}>
                          <Value value={row[op]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
      <p className='rounded-lg border bg-muted p-4 text-sm text-muted-foreground'>
        {t('numbers.precisionNote')}
      </p>
    </section>
  );
}
