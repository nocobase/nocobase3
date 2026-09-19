import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { useApiClient } from '@nocobase/app-client';
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
  const api = useApiClient();
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
    <Card
      className='min-w-0 shadow-2xs rounded-xl'
      role='region'
      aria-label={title}
    >
      <CardHeader>
        <CardTitle className='text-base font-semibold'>{title}</CardTitle>
        <CardDescription className='text-xs leading-relaxed'>
          {t(`combine_${definition.key}_description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <details className='rounded-lg border bg-muted/15 p-3 text-xs'>
          <summary className='cursor-pointer font-medium text-foreground'>
            {t('combineRequest')}
          </summary>
          <pre className='mt-3 max-h-96 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs text-foreground'>
            <code>{`await api.repository('${definition.repository}').findMany(${JSON.stringify(definition.options, null, 2)});`}</code>
          </pre>
        </details>
        <div>
          <Button
            size='sm'
            className='gap-1.5 font-medium'
            disabled={running}
            onClick={() => void run()}
          >
            {running ? t('loading') : t('combineRun')}
          </Button>
        </div>
        {running && (
          <p role='status' className='text-xs text-muted-foreground'>
            {t('loading')}
          </p>
        )}
        {error && (
          <p
            role='alert'
            className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive font-medium'
          >
            {error}
          </p>
        )}
        {result && (
          <div
            role='region'
            aria-label={t('combineResult')}
            className='space-y-2 pt-1'
          >
            <p className='text-xs text-muted-foreground font-medium'>
              {t(result.length ? 'combineResultHint' : 'combineEmpty')}
            </p>
            {result.length > 0 && (
              <>
                <p className='text-xs text-muted-foreground'>
                  {t('combineTableHint')}
                </p>
                <CombineResultTable
                  rows={result}
                  label={`${title} — ${t('combineTable')}`}
                />
              </>
            )}
            <details className='rounded-lg border bg-muted/15 p-3 text-xs'>
              <summary className='cursor-pointer font-medium text-foreground'>
                {t('combineJson')}
              </summary>
              <pre className='mt-3 max-h-96 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs text-muted-foreground'>
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
    <PageContainer>
      <PageHeader
        description={t('selectCombineIntro')}
        title={t('selectCombineTitle')}
      />
      <div className='flex items-start gap-2.5 rounded-xl border bg-muted/20 p-3.5 text-xs text-muted-foreground leading-relaxed'>
        <p>{t('combineScopeHint')}</p>
      </div>
      <div className='grid min-w-0 items-start gap-4'>
        {combineExamples.map((definition) => (
          <ExampleCard key={definition.key} definition={definition} />
        ))}
      </div>
    </PageContainer>
  );
}
