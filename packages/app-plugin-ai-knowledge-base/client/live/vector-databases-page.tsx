import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Switch } from '../components/ui/switch.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import { PagePagination } from '../components/common.js';
import { useKnowledgeBaseService } from '../providers/context.js';
import type {
  VectorDatabase,
  VectorDatabaseMutation,
  VectorDatabaseProvider,
} from '../providers/types.js';
import { normalizeVectorDatabaseMutation } from '../providers/service/knowledge-base-factory.js';
import { useT } from '../locales/index.js';

const pgProvider = 'NocobaseDefaultPGVectorProvider';
const blank: VectorDatabaseMutation = {
  name: '',
  provider: pgProvider,
  databaseSpec: 'PGVector',
  enabled: false,
  connectProps: {
    host: '',
    port: '',
    user: '',
    password: '',
    database: '',
    tableName: '',
  },
};

function isTableConflict(error: unknown): boolean {
  return /TABLE_ALREADY_EXISTS|table already exists|already exists/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

export default function VectorDatabasesPage(): React.ReactElement {
  const service = useKnowledgeBaseService();
  const t = useT();
  const [rows, setRows] = useState<VectorDatabase[]>([]);
  const [providers, setProviders] = useState<VectorDatabaseProvider[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [editing, setEditing] = useState<VectorDatabase>();
  const [form, setForm] = useState<VectorDatabaseMutation>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const result = await service.listVectorDatabases({
        mode: 'server',
        page,
        pageSize,
      });
      setRows(result.rows);
      setCount(result.count);
      if (!result.rows.length && page > 1) setPage(page - 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, service]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void service
      .listVectorDatabaseProviders()
      .then(setProviders)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [service]);

  const start = async (
    row?: VectorDatabase,
    requestedProvider?: VectorDatabaseProvider,
  ): Promise<void> => {
    setError('');
    setEditing(row);
    if (row) {
      try {
        const full = await service.getVectorDatabase(row.id);
        setEditing(full);
        setForm({
          key: full.key,
          name: full.name,
          provider: full.provider,
          databaseSpec: full.databaseSpec,
          enabled: full.enabled,
          connectProps: { ...full.connectProps, password: '' },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    } else {
      const provider = requestedProvider ?? providers[0];
      setForm({
        ...blank,
        key: crypto.randomUUID().replaceAll('-', ''),
        provider: provider?.name ?? pgProvider,
        databaseSpec: provider?.spec ?? 'PGVector',
        connectProps: { ...blank.connectProps },
      });
    }
    setOpen(true);
  };
  const fields = useMemo(
    () =>
      providers.find((item) => item.name === form.provider)?.fields ??
      (form.provider === pgProvider
        ? [
            { key: 'host', required: true },
            { key: 'port', type: 'number' as const, required: true },
            { key: 'user', required: true },
            { key: 'password', type: 'password' as const },
            { key: 'database', required: true },
            { key: 'tableName', required: true },
          ]
        : []),
    [form.provider, providers],
  );
  const formValid =
    Boolean(form.key?.trim() && form.name.trim() && fields.length) &&
    fields.every(
      (field) =>
        !field.required ||
        Boolean(String(form.connectProps[field.key] ?? '').trim()),
    );

  const testConnection = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const values = normalizeVectorDatabaseMutation(form, editing);
      const tested = await service.testVectorDatabaseConnection({
        provider: values.provider,
        connectProps: values.connectProps,
      });
      if (!tested.success) {
        throw new Error(tested.error || t('Connection test failed.'));
      }
      window.alert(t('Connection test succeeded.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const values = normalizeVectorDatabaseMutation(form, editing);
      if (editing) {
        const related = await service.findRelatedKnowledgeBases(editing.key);
        if (
          related.length &&
          !window.confirm(
            t(
              'This change affects related knowledge bases: {{names}}. Continue?',
              { names: related.map((item) => item.name).join(', ') },
            ),
          )
        )
          return;
        await service.updateVectorDatabase(editing.id, values);
      } else {
        try {
          await service.createVectorDatabase(values);
        } catch (cause) {
          if (
            !isTableConflict(cause) ||
            !window.confirm(t('Table already exists. Continue saving?'))
          )
            throw cause;
          await service.createVectorDatabase({
            ...values,
            skipTableExistedCheck: true,
          });
        }
      }
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (row: VectorDatabase): Promise<boolean> => {
    try {
      const related = await service.findRelatedKnowledgeBases(row.key);
      if (related.length) {
        setError(
          t('Cannot delete {{name}} because it is used by: {{names}}', {
            name: row.name,
            names: related.map((item) => item.name).join(', '),
          }),
        );
        return false;
      }
      if (!window.confirm(t('Delete this vector database?'))) return false;
      await service.deleteVectorDatabase(row.id);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  };
  const bulkDelete = async (): Promise<void> => {
    const selectedRows = rows.filter((item) => selected.has(String(item.id)));
    if (!selectedRows.length) return;
    if (
      !window.confirm(
        t('Delete {{count}} selected vector database(s)?', {
          count: selectedRows.length,
        }),
      )
    )
      return;
    setBusy(true);
    setError('');
    const failures: string[] = [];
    for (const row of selectedRows) {
      const related = await service
        .findRelatedKnowledgeBases(row.key)
        .catch(() => undefined);
      if (!related) {
        failures.push(row.name);
        continue;
      }
      if (related.length) {
        failures.push(
          `${row.name} (${related.map((item) => item.name).join(', ')})`,
        );
        continue;
      }
      try {
        await service.deleteVectorDatabase(row.id);
      } catch {
        failures.push(row.name);
      }
    }
    setSelected(new Set());
    if (failures.length)
      setError(
        t('Some vector databases were not deleted: {{names}}', {
          names: failures.join('; '),
        }),
      );
    await load();
    setBusy(false);
  };

  return (
    <main className='p-6'>
      <Card>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Button
              variant='outline'
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw
                className={loading ? 'size-4 animate-spin' : 'size-4'}
              />
              {t('Refresh')}
            </Button>
            <Button
              disabled={!selected.size || busy}
              variant='outline'
              onClick={() => void bulkDelete()}
            >
              <Trash2 className='size-4' />
              {t('Delete')}
            </Button>
            <DropdownMenu
              open={providerMenuOpen}
              onOpenChange={setProviderMenuOpen}
            >
              <DropdownMenuTrigger
                render={
                  <Button disabled={!providers.length}>
                    <Plus className='size-4' />
                    {t('Add new')}
                    <ChevronDown className='size-4' />
                  </Button>
                }
              />
              <DropdownMenuContent align='end'>
                {providers.map((provider) => (
                  <DropdownMenuItem
                    key={provider.name}
                    onClick={() => {
                      setProviderMenuOpen(false);
                      void start(undefined, provider);
                    }}
                  >
                    {provider.spec}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <div className='overflow-hidden rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10'>
                    <span className='sr-only'>{t('Select')}</span>
                  </TableHead>
                  <TableHead>{t('Key')}</TableHead>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Vector database')}</TableHead>
                  <TableHead>{t('Enabled')}</TableHead>
                  <TableHead className='text-left'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={String(row.id)}>
                    <TableCell>
                      <input
                        aria-label={t('Select {{name}}', { name: row.name })}
                        type='checkbox'
                        checked={selected.has(String(row.id))}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(String(row.id));
                            else next.delete(String(row.id));
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>{row.key}</TableCell>
                    <TableCell className='font-medium'>{row.name}</TableCell>
                    <TableCell>{row.databaseSpec}</TableCell>
                    <TableCell>
                      {row.enabled ? (
                        <Check
                          className='size-4 text-emerald-600'
                          aria-label={t('Enabled')}
                        />
                      ) : (
                        <X
                          className='size-4 text-destructive'
                          aria-label={t('Disabled')}
                        />
                      )}
                    </TableCell>
                    <TableCell className='text-left'>
                      <div className='flex items-center justify-start gap-1'>
                        <Button
                          variant='ghost'
                          className='h-8 px-2'
                          onClick={() => void start(row)}
                        >
                          <Pencil className='size-4' />
                          {t('Edit')}
                        </Button>
                        <Button
                          variant='ghost'
                          className='h-8 px-2'
                          onClick={() =>
                            void remove(row).then((deleted) => {
                              if (deleted) return load();
                            })
                          }
                        >
                          <Trash2 className='size-4' />
                          {t('Delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && !loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className='h-32 text-center text-muted-foreground'
                    >
                      {t('No vector databases yet.')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <PagePagination
            page={page}
            pageSize={pageSize}
            total={count}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>
      <Sheet open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <SheetContent
          side='right'
          className='!w-[50vw] !max-w-none gap-0'
          showCloseButton={!busy}
        >
          <SheetHeader className='border-b px-6 py-4'>
            <SheetTitle>
              {editing
                ? t('Edit {{spec}}', { spec: form.databaseSpec })
                : t('Add {{spec}}', { spec: form.databaseSpec })}
            </SheetTitle>
          </SheetHeader>
          <div className='grid flex-1 content-start gap-4 overflow-y-auto px-6 py-5'>
            <div>
              <Label htmlFor='vector-spec'>{t('Vector database')}</Label>
              <Input
                id='vector-spec'
                disabled
                value={form.databaseSpec ?? ''}
              />
            </div>
            <div>
              <Label htmlFor='vector-key'>{t('Key')}</Label>
              <Input
                id='vector-key'
                disabled={!!editing}
                value={form.key ?? ''}
                onChange={(event) =>
                  setForm((value) => ({ ...value, key: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor='vector-name'>{t('Name')}</Label>
              <Input
                id='vector-name'
                value={form.name}
                onChange={(event) =>
                  setForm((value) => ({ ...value, name: event.target.value }))
                }
              />
            </div>
            {!fields.length ? (
              <p role='alert' className='text-sm text-destructive'>
                {t(
                  'Provider metadata is unavailable. This configuration cannot be submitted.',
                )}
              </p>
            ) : (
              fields.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`vector-${field.key}`}>
                    {field.key === 'host'
                      ? t('Host')
                      : field.key === 'port'
                        ? t('Port')
                        : field.key === 'user'
                          ? t('Username')
                          : field.key === 'password'
                            ? t('Password')
                            : field.key === 'database'
                              ? t('Database')
                              : field.key === 'tableName'
                                ? t('Table name')
                                : (field.label ?? field.key)}
                  </Label>
                  <Input
                    id={`vector-${field.key}`}
                    type={
                      field.type === 'password'
                        ? 'password'
                        : field.type === 'number'
                          ? 'number'
                          : 'text'
                    }
                    value={String(form.connectProps[field.key] ?? '')}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        connectProps: {
                          ...value.connectProps,
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))
            )}
            <div className='flex items-center gap-3'>
              <Switch
                checked={form.enabled === true}
                onCheckedChange={(enabled) =>
                  setForm((value) => ({ ...value, enabled }))
                }
              />
              <Label>{t('Enabled')}</Label>
            </div>
          </div>
          <SheetFooter className='flex-row justify-end border-t px-6 py-4'>
            <Button
              variant='outline'
              disabled={busy || !formValid}
              onClick={() => void testConnection()}
            >
              {busy ? <RefreshCw className='size-4 animate-spin' /> : null}
              {t('Test')}
            </Button>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button disabled={busy || !formValid} onClick={() => void save()}>
              {busy ? <RefreshCw className='size-4 animate-spin' /> : null}
              {t('Submit')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}

export const Component: typeof VectorDatabasesPage = VectorDatabasesPage;
