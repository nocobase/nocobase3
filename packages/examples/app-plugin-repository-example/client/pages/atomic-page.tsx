import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  atomicRepository,
  atomicUpdate,
  type AtomicCounter,
  type AtomicChange,
} from '../atomic.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';

const NS = '@nocobase/app-plugin-repository-example';
const scenarios = [
  {
    id: 'demo-stock',
    title: 'atomicStock',
    hint: 'atomicStockHint',
    initial: '10',
    actions: ['increment', 'decrement'],
  },
  {
    id: 'demo-wallet',
    title: 'atomicWallet',
    hint: 'atomicWalletHint',
    initial: '500',
    actions: ['increment', 'decrement'],
  },
  {
    id: 'demo-points',
    title: 'atomicPoints',
    hint: 'atomicPointsHint',
    initial: '10',
    actions: ['increment', 'multiply'],
  },
  {
    id: 'demo-visits',
    title: 'atomicVisits',
    hint: 'atomicVisitsHint',
    initial: '1',
    actions: ['increment', 'concurrent'],
  },
] as const;
interface Trace {
  readonly action: string;
  readonly input: unknown;
  readonly output: unknown;
}
export default function AtomicPage(): ReactElement {
  const api = useService(apiClientToken);
  const repo = useMemo(() => atomicRepository(api), [api]);
  const { t } = useTranslation(NS);
  const [records, setRecords] = useState<AtomicCounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(
      scenarios.map((scenario) => [scenario.id, scenario.initial]),
    ),
  );
  const [traces, setTraces] = useState<Trace[]>([]);
  const trace = (entry: Trace): void =>
    setTraces((current) => [entry, ...current].slice(0, 10));
  useEffect(() => {
    let active = true;
    void repo
      .findMany({ limit: 100 })
      .then((result) => {
        if (active) setRecords(result);
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
  }, [repo, revision, t]);
  const reload = (): void => {
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
  };
  async function update(
    id: string,
    change: AtomicChange | 'concurrent',
  ): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    const input = atomicUpdate(
      id,
      change === 'concurrent' ? { increment: 1 } : change,
    );
    try {
      if (change === 'concurrent') {
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, () => repo.updateOne(input)),
        );
        const succeeded = results.filter(
          (result) => result.status === 'fulfilled',
        ).length;
        trace({
          action: '10 × updateOne',
          input,
          output: results.map((result) =>
            result.status === 'fulfilled'
              ? result.value
              : {
                  error:
                    result.reason instanceof Error
                      ? result.reason.message
                      : t('error'),
                },
          ),
        });
        setNotice(t('atomicConcurrentResult', { count: succeeded }));
        if (succeeded !== 10) setError(t('atomicPartial'));
      } else {
        const result = await repo.updateOne(input);
        trace({ action: 'updateOne', input, output: result });
        setNotice(t('atomicUpdated', { value: result.record.value }));
      }
    } catch (value) {
      const message =
        value instanceof ApiClientError && value.status === 404
          ? t('atomicInsufficient')
          : value instanceof Error
            ? value.message
            : t('error');
      trace({ action: 'updateOne', input, output: { error: message } });
      setError(message);
    } finally {
      // Read the committed value even after partial concurrency success or a
      // response failure; never derive the new value from a browser snapshot.
      try {
        setRecords(await repo.findMany({ limit: 100 }));
      } catch (value) {
        setError(value instanceof Error ? value.message : t('loadError'));
      }
      setBusy(false);
    }
  }
  return (
    <main className='mx-auto max-w-7xl space-y-6 p-6'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-2'>
          <h1 className='text-3xl font-semibold'>{t('atomicTitle')}</h1>
          <p className='max-w-3xl text-muted-foreground'>{t('atomicIntro')}</p>
        </div>
        <Button variant='outline' disabled={loading || busy} onClick={reload}>
          {t('refresh')}
        </Button>
      </header>
      {error && (
        <p
          role='alert'
          className='rounded-md border border-destructive/30 p-3 text-destructive'
        >
          {error}
        </p>
      )}
      {notice && <p role='status'>{notice}</p>}
      {loading && <p role='status'>{t('loading')}</p>}
      <div className='grid gap-4 md:grid-cols-2'>
        {scenarios.map((scenario) => {
          const record = records.find((entry) => entry.id === scenario.id);
          const amount = Number(amounts[scenario.id]);
          const valid =
            Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000;
          return (
            <Card
              key={scenario.id}
              role='region'
              aria-label={t(scenario.title)}
            >
              <CardHeader>
                <CardTitle>{t(scenario.title)}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <p className='text-sm text-muted-foreground'>
                  {t(scenario.hint)}
                </p>
                <output
                  aria-label={t(scenario.title)}
                  className='block text-4xl font-semibold tabular-nums'
                >
                  {record?.value ?? '—'}
                </output>
                {!loading && !record && (
                  <p className='text-sm text-muted-foreground'>
                    {t('atomicSeedHint')}
                  </p>
                )}
                <label className='block space-y-2 text-sm'>
                  <span>{t('atomicAmount')}</span>
                  <Input
                    type='number'
                    min={1}
                    max={1000000}
                    step={1}
                    aria-label={`${t(scenario.title)} — ${t('atomicAmount')}`}
                    disabled={busy || loading || !record}
                    value={amounts[scenario.id]}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [scenario.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className='flex flex-wrap gap-2'>
                  {scenario.actions.map((action) => (
                    <Button
                      key={action}
                      variant={action === 'decrement' ? 'outline' : 'default'}
                      disabled={
                        busy ||
                        loading ||
                        !record ||
                        ((action === 'increment' || action === 'decrement') &&
                          !valid)
                      }
                      onClick={() =>
                        void update(
                          scenario.id,
                          action === 'concurrent'
                            ? 'concurrent'
                            : action === 'multiply'
                              ? { multiply: 2 }
                              : action === 'increment'
                                ? { increment: amount }
                                : { decrement: amount },
                        )
                      }
                    >
                      {t(`atomic_${action}`)}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <details className='rounded-lg border p-4' open>
        <summary className='cursor-pointer font-medium'>{t('trace')}</summary>
        <p className='my-3 text-sm text-muted-foreground'>
          {t('atomicTraceHint')}
        </p>
        {traces.map((entry, index) => (
          <details
            key={`${traces.length - index}-${entry.action}`}
            className='my-2 rounded-md bg-muted p-3'
            open={index === 0}
          >
            <summary className='cursor-pointer font-mono text-sm'>
              {entry.action}
            </summary>
            <div className='mt-3 grid gap-4 md:grid-cols-2'>
              <section>
                <h3>{t('request')}</h3>
                <pre className='max-h-72 overflow-auto text-xs'>
                  {JSON.stringify(entry.input, null, 2)}
                </pre>
              </section>
              <section>
                <h3>{t('response')}</h3>
                <pre className='max-h-72 overflow-auto text-xs'>
                  {JSON.stringify(entry.output, null, 2)}
                </pre>
              </section>
            </div>
          </details>
        ))}
      </details>
    </main>
  );
}
