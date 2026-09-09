import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { GroupByExample } from '../group-by.js';
import { detailPath } from '../model.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.js';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table.js';

export function GroupByExamples({
  examples,
}: {
  readonly examples: readonly GroupByExample[];
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-repository-example');
  return (
    <section className='space-y-4' aria-label={t('groupByExamples')}>
      <h2 className='text-xl font-semibold'>{t('groupByExamples')}</h2>
      {examples.map((example) => (
        <Card key={example.key}>
          <CardHeader>
            <CardTitle>{t(`groupBy_${example.key}`)}</CardTitle>
            <p className='text-sm text-muted-foreground'>
              {t(`groupBy_${example.key}Hint`)}
            </p>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Table aria-label={t(`groupBy_${example.key}`)}>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t(example.target === 'customers' ? 'customer' : 'product')}
                  </TableHead>
                  {example.key === 'customerStatus' && (
                    <TableHead>{t('status')}</TableHead>
                  )}
                  {example.key === 'productPrice' && (
                    <TableHead>{t('unitPriceCents')}</TableHead>
                  )}
                  <TableHead>COUNT(*)</TableHead>
                  {example.key === 'productPrice' && (
                    <TableHead>SUM(quantity)</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {example.rows.map((row) => (
                  <TableRow
                    key={JSON.stringify([row.id, row.status, row.price])}
                  >
                    <TableCell>
                      <Link
                        className='text-primary hover:underline'
                        to={detailPath(example.target, row.id)}
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    {example.key === 'customerStatus' && (
                      <TableCell>{t(row.status ?? 'none')}</TableCell>
                    )}
                    {example.key === 'productPrice' && (
                      <TableCell>{row.price ?? 'NULL'}</TableCell>
                    )}
                    <TableCell>{row.count ?? 'NULL'}</TableCell>
                    {example.key === 'productPrice' && (
                      <TableCell>{row.quantity ?? 'NULL'}</TableCell>
                    )}
                  </TableRow>
                ))}
                {example.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={
                        example.key === 'productPrice'
                          ? 4
                          : example.key === 'customerStatus'
                            ? 3
                            : 2
                      }
                    >
                      {t('groupByEmpty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <details className='rounded-md border p-3'>
              <summary className='cursor-pointer text-sm font-medium'>
                {t('trace')}
              </summary>
              <div className='mt-3 grid gap-4 lg:grid-cols-2'>
                <section>
                  <h3 className='mb-2 text-sm font-medium'>{t('request')}</h3>
                  <pre className='max-h-80 overflow-auto text-xs'>
                    {JSON.stringify(
                      {
                        repository: example.call.repository,
                        action: example.call.action,
                        options: example.call.options,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </section>
                <section>
                  <h3 className='mb-2 text-sm font-medium'>{t('response')}</h3>
                  <pre className='max-h-80 overflow-auto text-xs'>
                    {JSON.stringify(example.call.result, null, 2)}
                  </pre>
                </section>
              </div>
            </details>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
