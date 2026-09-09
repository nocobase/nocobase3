import { apiClientToken, useService } from '@nocobase/app-client';
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
  combineExamples,
  runCombineExample,
  type CombineExample,
} from '../select-combine.js';

const NS = '@nocobase/app-plugin-repository-example';

function ExampleCard({
  definition,
}: {
  readonly definition: CombineExample;
}): ReactElement {
  const api = useService(apiClientToken);
  const { t } = useTranslation(NS);
  const [result, setResult] = useState<Record<string, unknown>[]>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  async function run(): Promise<void> {
    setRunning(true);
    setResult(undefined);
    setError('');
    try {
      setResult(await runCombineExample(api, definition));
    } catch (value) {
      setError(value instanceof Error ? value.message : t('loadError'));
    } finally {
      setRunning(false);
    }
  }
  const title = t(`combine_${definition.key}_title`);
  return (
    <Card className='min-w-0' role='region' aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {t(`combine_${definition.key}_description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <details className='rounded-lg border p-3'>
          <summary className='cursor-pointer font-medium'>
            {t('combineRequest')}
          </summary>
          <pre className='mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs'>
            <code>{`await api.repository('${definition.repository}').findMany(${JSON.stringify(definition.options, null, 2)});`}</code>
          </pre>
        </details>
        <Button disabled={running} onClick={() => void run()}>
          {running ? t('loading') : t('combineRun')}
        </Button>
        {running && <p role='status'>{t('loading')}</p>}
        {error && (
          <p role='alert' className='text-destructive'>
            {error}
          </p>
        )}
        {result && (
          <div
            role='region'
            aria-label={t('combineResult')}
            className='space-y-2'
          >
            <p className='text-sm text-muted-foreground'>
              {t(result.length ? 'combineResultHint' : 'combineEmpty')}
            </p>
            {result.length > 0 && (
              <>
                <p className='text-sm text-muted-foreground'>
                  {t('combineTableHint')}
                </p>
                <CombineResultTable
                  rows={result}
                  label={`${title} — ${t('combineTable')}`}
                />
              </>
            )}
            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer font-medium'>
                {t('combineJson')}
              </summary>
              <pre className='mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs'>
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SelectCombinePage(): ReactElement {
  const { t } = useTranslation(NS);
  return (
    <main className='mx-auto max-w-7xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>{t('selectCombineTitle')}</h1>
        <p className='max-w-4xl text-muted-foreground'>
          {t('selectCombineIntro')}
        </p>
        <p className='text-sm text-muted-foreground'>{t('combineScopeHint')}</p>
      </header>
      <div className='grid min-w-0 items-start gap-6'>
        {combineExamples.map((definition) => (
          <ExampleCard key={definition.key} definition={definition} />
        ))}
      </div>
    </main>
  );
}
