import { apiClientToken, useService } from '@nocobase/app-client';
import { ApiClientError } from '@nocobase/api-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { CombineResultTable } from '../components/combine-result-table.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import {
  sortExamples,
  sortExampleRequest,
  runSortExample,
  type SortExample,
} from '../sort.js';

const NS = '@nocobase/app-plugin-repository-example';
function SortCard({
  example,
}: {
  readonly example: SortExample;
}): ReactElement {
  const api = useService(apiClientToken);
  const { t } = useTranslation(NS);
  const [rows, setRows] = useState<Record<string, unknown>[]>();
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    expected: boolean;
  }>();
  const title = t(`sort_${example.key}_title`);
  async function run(): Promise<void> {
    setRunning(true);
    setRows(undefined);
    setFailure(undefined);
    try {
      const result = await runSortExample(api, example);
      if (example.expectedError)
        setFailure({ message: t('sortUnexpectedSuccess'), expected: false });
      else setRows(result);
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : undefined;
      setFailure({
        message: `${code ? `${code}: ` : ''}${error instanceof Error ? error.message : t('loadError')}`,
        expected: !!example.expectedError && code === example.expectedError,
      });
    } finally {
      setRunning(false);
    }
  }
  return (
    <Card role='region' aria-label={title} className='min-w-0'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {t(`sort_${example.key}_description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <pre className='overflow-auto rounded-md bg-muted p-3 text-xs'>
          <code>{example.builder}</code>
        </pre>
        <details className='rounded-lg border p-3'>
          <summary className='cursor-pointer font-medium'>
            {t('sortRequest')}
          </summary>
          <pre className='mt-3 max-h-96 overflow-auto text-xs'>
            {JSON.stringify(
              {
                repository: example.repository,
                action: 'findMany',
                options: sortExampleRequest(example),
              },
              null,
              2,
            )}
          </pre>
        </details>
        <Button disabled={running} onClick={() => void run()}>
          {running ? t('loading') : t('combineRun')}
        </Button>
        {running && <p role='status'>{t('loading')}</p>}
        {failure && (
          <p
            role={failure.expected ? 'status' : 'alert'}
            className={
              failure.expected ? 'text-muted-foreground' : 'text-destructive'
            }
          >
            {failure.expected && `${t('sortExpectedError')} — `}
            {failure.message}
          </p>
        )}
        {rows && (
          <div
            className='space-y-3'
            role='region'
            aria-label={t('combineResult')}
          >
            <p className='text-sm text-muted-foreground'>
              {t(rows.length ? 'sortResultHint' : 'combineEmpty')}
            </p>
            {rows.length > 0 && (
              <CombineResultTable
                rows={rows}
                label={`${title} — ${t('combineTable')}`}
              />
            )}
            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer font-medium'>
                {t('combineJson')}
              </summary>
              <pre className='mt-3 max-h-96 overflow-auto text-xs'>
                {JSON.stringify(rows, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export default function SortPage(): ReactElement {
  const { t } = useTranslation(NS);
  return (
    <main className='mx-auto max-w-7xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>{t('sortTitle')}</h1>
        <p className='text-muted-foreground'>{t('sortIntro')}</p>
        <p className='text-sm text-muted-foreground'>{t('sortLimits')}</p>
      </header>
      {sortExamples.map((example) => (
        <SortCard key={example.key} example={example} />
      ))}
    </main>
  );
}
