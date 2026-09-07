import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  findManyOptions,
  findManyRepository,
  type FindManyRecord,
} from '../find-many.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';

const NS = '@nocobase/app-plugin-repository-example';

interface ExamplePanelProps {
  readonly title: string;
  readonly description: string;
  readonly protocol: string;
  readonly code: string;
  readonly button: string;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly records: readonly FindManyRecord[];
  readonly onRun: () => void;
}

function ExamplePanel(props: ExamplePanelProps): ReactElement {
  const { t } = useTranslation(NS);
  return (
    <Card role='region' aria-label={props.title}>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>{props.description}</p>
        <p className='text-sm'>
          <span className='font-medium'>{t('findManyProtocol')}:</span>{' '}
          <code>{props.protocol}</code>
        </p>
        <pre className='overflow-x-auto rounded-md bg-muted p-3 text-xs'>
          <code>{props.code}</code>
        </pre>
        <div className='flex items-center gap-3'>
          <Button disabled={props.disabled} onClick={props.onRun}>
            {props.button}
          </Button>
          <output aria-label={`${props.title} — ${t('findManyReceived')}`}>
            {t('findManyReceivedCount', { count: props.records.length })}
          </output>
        </div>
        {props.loading && <p role='status'>{t('loading')}</p>}
        <Table aria-label={`${props.title} — ${t('findManyResults')}`}>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t('findManyRecordTitle')}</TableHead>
              <TableHead>{t('findManyCategory')}</TableHead>
              <TableHead>{t('findManyDescription')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.sequence}</TableCell>
                <TableCell>{record.title}</TableCell>
                <TableCell>{record.category}</TableCell>
                <TableCell>{record.description}</TableCell>
              </TableRow>
            ))}
            {!props.records.length && !props.loading && (
              <TableRow>
                <TableCell colSpan={4}>{t('findManyEmpty')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function FindManyPage(): ReactElement {
  const api = useService(apiClientToken);
  const repository = useMemo(() => findManyRepository(api), [api]);
  const { t } = useTranslation(NS);
  const runRef = useRef(0);
  const [arrayRecords, setArrayRecords] = useState<FindManyRecord[]>([]);
  const [streamRecords, setStreamRecords] = useState<FindManyRecord[]>([]);
  const [arrayLoading, setArrayLoading] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  async function loadArray(): Promise<void> {
    const current = ++runRef.current;
    setArrayLoading(true);
    setArrayRecords([]);
    setError('');
    try {
      const records = await repository.findMany(findManyOptions);
      if (runRef.current === current) setArrayRecords(records);
    } catch (value) {
      if (runRef.current === current)
        setError(value instanceof Error ? value.message : t('loadError'));
    } finally {
      if (runRef.current === current) setArrayLoading(false);
    }
  }

  async function loadStream(): Promise<void> {
    const current = ++runRef.current;
    setStreamLoading(true);
    setStreamRecords([]);
    setError('');
    try {
      for await (const record of repository.findMany(findManyOptions)) {
        if (runRef.current !== current) break;
        setStreamRecords((records) => [...records, record]);
      }
    } catch (value) {
      if (runRef.current === current)
        setError(value instanceof Error ? value.message : t('loadError'));
    } finally {
      if (runRef.current === current) setStreamLoading(false);
    }
  }

  const busy = arrayLoading || streamLoading;
  return (
    <main className='mx-auto max-w-7xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>{t('findManyTitle')}</h1>
        <p className='max-w-4xl text-muted-foreground'>{t('findManyIntro')}</p>
      </header>
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}
      <div className='grid items-start gap-6 xl:grid-cols-2'>
        <ExamplePanel
          title={t('findManyArrayTitle')}
          description={t('findManyArrayDescription')}
          protocol='Accept: application/json'
          code={
            'const records = await repository.findMany({\n  limit: 24,\n  sort: sequenceAscending,\n});'
          }
          button={t('findManyRunArray')}
          loading={arrayLoading}
          disabled={busy}
          records={arrayRecords}
          onRun={() => {
            if (!busy) void loadArray();
          }}
        />
        <ExamplePanel
          title={t('findManyStreamTitle')}
          description={t('findManyStreamDescription')}
          protocol='Accept: application/x-ndjson'
          code={
            'for await (const record of repository.findMany({\n  limit: 24,\n  sort: sequenceAscending,\n})) {\n  consume(record);\n}'
          }
          button={t('findManyRunStream')}
          loading={streamLoading}
          disabled={busy}
          records={streamRecords}
          onRun={() => {
            if (!busy) void loadStream();
          }}
        />
      </div>
    </main>
  );
}
