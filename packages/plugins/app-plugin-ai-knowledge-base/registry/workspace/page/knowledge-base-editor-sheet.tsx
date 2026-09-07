import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useKnowledgeBaseService } from '@/extensions/nocobase-ai-knowledge-base-providers';
import type {
  KnowledgeBase,
  KnowledgeBaseType,
  KnowledgeBaseManagementOption,
  KnowledgeBaseManagementOptions,
  KnowledgeBaseMutation,
} from '@/extensions/nocobase-ai-knowledge-base-providers';
import { normalizeKnowledgeBaseMutation } from '@/extensions/nocobase-ai-knowledge-base-providers';
import { useT } from '@/extensions/nocobase-ai-knowledge-base-components/locales';

const defaultSegmentOptions = {
  enabled: true,
  chunkSize: 6000,
  chunkOverlap: 1200,
};
const emptyOptions: KnowledgeBaseManagementOptions = {
  vectorDatabases: [],
  llmServices: [],
  storages: [],
  externalProviders: [],
};
const knowledgeBaseTypeDetails: Record<
  KnowledgeBaseType,
  {
    label: 'Local' | 'Read-only' | 'External';
    description: string;
    badgeClassName: string;
  }
> = {
  LOCAL: {
    label: 'Local',
    description:
      'Suitable for knowledge bases where documents, segments, and vector data are maintained in the current system.',
    badgeClassName: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  READONLY: {
    label: 'Read-only',
    description:
      'Suitable for scenarios that only connect an existing vector database as the RAG retrieval source. Document maintenance and vectorization are completed by an external system.',
    badgeClassName: 'bg-muted text-muted-foreground ring-border',
  },
  EXTERNAL: {
    label: 'External',
    description:
      'Suitable for retrieval scenarios where you develop a plugin to connect external APIs or other vector databases.',
    badgeClassName: 'bg-purple-50 text-purple-700 ring-purple-200',
  },
};

function newKnowledgeBase(
  knowledgeBaseType: KnowledgeBaseType,
): KnowledgeBaseMutation {
  return {
    key: `kb-${Date.now().toString(36)}`,
    name: '',
    description: '',
    knowledgeBaseType,
    ...(knowledgeBaseType === 'LOCAL'
      ? { segmentOptions: defaultSegmentOptions }
      : {}),
    enabled: true,
  };
}

function editKnowledgeBase(record: KnowledgeBase): KnowledgeBaseMutation {
  return {
    key: record.key,
    name: record.name,
    description: record.description ?? '',
    knowledgeBaseType: record.knowledgeBaseType,
    enabled: record.enabled,
    disk: record.disk,
    vectorDatabaseKey: record.vectorDatabaseKey ?? record.vectorStoreConfigKey,
    vectorStoreConfigKey: record.vectorStoreConfigKey,
    llmService: record.llmService,
    embeddingModel: record.embeddingModel,
    vectorStoreProvider: record.vectorStoreProvider,
    vectorStoreProps: record.vectorStoreProps,
    segmentOptions: record.segmentOptions ?? defaultSegmentOptions,
  };
}

function OptionSelect({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value?: string;
  options: KnowledgeBaseManagementOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Select
      value={value ?? null}
      disabled={disabled}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger className='w-full'>
        <SelectValue>
          {value
            ? (options.find((option) => option.value === value)?.label ?? value)
            : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditableOptionInput({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value?: string;
  options: KnowledgeBaseManagementOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}): ReactElement {
  const items = options.map((option) => option.value);
  return (
    <Combobox
      items={items}
      value={value ?? null}
      onValueChange={(next) => next && onChange(next)}
      onInputValueChange={onChange}
    >
      <ComboboxInput
        className='w-full'
        placeholder={placeholder}
        disabled={disabled}
        showClear
      />
      <ComboboxContent className='w-(--anchor-width) min-w-0'>
        <ComboboxEmpty>{placeholder}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {options.find((option) => option.value === item)?.label ?? item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function KnowledgeBaseEditorSheet({
  open,
  record,
  knowledgeBaseType,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  record?: KnowledgeBase;
  knowledgeBaseType: KnowledgeBaseType;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const t = useT();
  const service = useKnowledgeBaseService();
  const [values, setValues] = useState<KnowledgeBaseMutation>(() =>
    newKnowledgeBase(knowledgeBaseType),
  );
  const [options, setOptions] =
    useState<KnowledgeBaseManagementOptions>(emptyOptions);
  const [embeddingModels, setEmbeddingModels] = useState<
    KnowledgeBaseManagementOption[]
  >([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [externalProps, setExternalProps] = useState('[]');

  useEffect(() => {
    if (!open) return;
    const initial = record
      ? editKnowledgeBase(record)
      : newKnowledgeBase(knowledgeBaseType);
    setValues(initial);
    setExternalProps(JSON.stringify(initial.vectorStoreProps ?? [], null, 2));
    setEmbeddingModels([]);
    setError(undefined);
    setLoadingOptions(true);
    void service
      .listKnowledgeBaseManagementOptions()
      .then((loaded) => {
        setOptions(loaded);
        setValues((current) =>
          current.knowledgeBaseType === 'LOCAL' && !current.disk
            ? { ...current, disk: loaded.storages[0]?.value }
            : current,
        );
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setLoadingOptions(false));
  }, [knowledgeBaseType, open, record, service]);

  useEffect(() => {
    if (
      !open ||
      !values.llmService ||
      values.knowledgeBaseType === 'EXTERNAL'
    ) {
      setEmbeddingModels([]);
      return;
    }
    void service
      .listEmbeddingModels(values.llmService)
      .then(setEmbeddingModels)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [open, service, values.knowledgeBaseType, values.llmService]);

  const save = async (): Promise<void> => {
    if (!values.name.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      if (!values.key?.trim()) throw new Error(t('Key is required.'));
      if (values.knowledgeBaseType !== 'EXTERNAL') {
        if (!values.vectorDatabaseKey)
          throw new Error(t('Select a vector database.'));
        if (!values.llmService) throw new Error(t('Select an LLM service.'));
        if (values.knowledgeBaseType === 'LOCAL' && !values.disk) {
          throw new Error(t('Select a file storage disk.'));
        }
      } else if (!values.vectorStoreProvider) {
        throw new Error(t('Select an external vector-store provider.'));
      }
      const visible = new Set<string>([
        'key',
        'name',
        'description',
        'knowledgeBaseType',
        'enabled',
      ]);
      if (values.knowledgeBaseType === 'LOCAL') visible.add('disk');
      if (values.knowledgeBaseType !== 'EXTERNAL') {
        visible.add('vectorDatabaseKey');
        visible.add('llmService');
        visible.add('embeddingModel');
      }
      if (local) visible.add('segmentOptions');
      if (external) visible.add('vectorStoreProps');
      let parsedExternalProps: KnowledgeBaseMutation['vectorStoreProps'];
      if (external) {
        try {
          const parsed: unknown = JSON.parse(externalProps);
          if (!Array.isArray(parsed))
            throw new Error('Provider properties must be a JSON array.');
          parsedExternalProps = parsed.flatMap(
            (
              value,
            ): NonNullable<
              KnowledgeBaseMutation['vectorStoreProps']
            >[number][] => {
              if (!value || typeof value !== 'object' || Array.isArray(value))
                return [];
              const item = value as Record<string, unknown>;
              return typeof item.key === 'string'
                ? [{ key: item.key, value: item.value }]
                : [];
            },
          );
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setSaving(false);
          return;
        }
      }
      const payload = normalizeKnowledgeBaseMutation(
        {
          ...values,
          ...(external ? { vectorStoreProps: parsedExternalProps } : {}),
        },
        record,
        visible,
      );
      if (record) await service.updateKnowledgeBase(record.id, payload);
      else await service.createKnowledgeBase(payload);
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const local = values.knowledgeBaseType === 'LOCAL';
  const external = values.knowledgeBaseType === 'EXTERNAL';
  const typeDetails = knowledgeBaseTypeDetails[values.knowledgeBaseType];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='w-full overflow-y-auto sm:max-w-none md:w-1/2'
      >
        <SheetHeader className='border-b px-6 py-5'>
          <SheetTitle>
            {record ? t('Edit knowledge base') : t('New knowledge base')}
          </SheetTitle>
        </SheetHeader>
        <form
          className='grid gap-5 px-6 pb-6'
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className='grid gap-2 rounded-lg border bg-card p-4'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-semibold'>
                {t('Knowledge base type:')}
              </span>
              <span
                className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset ${typeDetails.badgeClassName}`}
              >
                {t(typeDetails.label)}
              </span>
            </div>
            <p className='text-sm leading-5 text-muted-foreground'>
              {t(typeDetails.description)}
            </p>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='knowledge-base-key'>{t('Key')}</Label>
            <Input
              id='knowledge-base-key'
              value={values.key ?? ''}
              disabled={!!record}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  key: event.target.value,
                }))
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='knowledge-base-name'>{t('Name')}</Label>
            <Input
              id='knowledge-base-name'
              autoFocus
              required
              value={values.name}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>
          {local ? (
            <div className='grid gap-2'>
              <Label>{t('File storage')}</Label>
              <OptionSelect
                value={values.disk}
                options={options.storages}
                placeholder={
                  loadingOptions ? t('Loading…') : t('Select file storage')
                }
                disabled={loadingOptions || !!record}
                onChange={(disk) =>
                  setValues((current) => ({ ...current, disk }))
                }
              />
            </div>
          ) : null}
          {!external ? (
            <>
              <div className='grid gap-2'>
                <Label>{t('Vector database')}</Label>
                <OptionSelect
                  value={values.vectorDatabaseKey}
                  options={options.vectorDatabases}
                  placeholder={
                    loadingOptions ? t('Loading…') : t('Select vector database')
                  }
                  disabled={loadingOptions}
                  onChange={(vectorDatabaseKey) =>
                    setValues((current) => ({ ...current, vectorDatabaseKey }))
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label>{t('LLM service')}</Label>
                <OptionSelect
                  value={values.llmService}
                  options={options.llmServices}
                  placeholder={
                    loadingOptions ? t('Loading…') : t('Select LLM service')
                  }
                  disabled={loadingOptions}
                  onChange={(llmService) =>
                    setValues((current) => ({
                      ...current,
                      llmService,
                      embeddingModel: undefined,
                    }))
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label>{t('Embedding model')}</Label>
                <EditableOptionInput
                  value={values.embeddingModel}
                  options={embeddingModels}
                  placeholder={
                    values.llmService
                      ? t('Select or enter an embedding model')
                      : t('Select an LLM service first')
                  }
                  disabled={!values.llmService}
                  onChange={(embeddingModel) =>
                    setValues((current) => ({ ...current, embeddingModel }))
                  }
                />
              </div>
            </>
          ) : (
            <div className='grid gap-2'>
              <Label>{t('External vector-store provider')}</Label>
              <OptionSelect
                value={values.vectorStoreProvider}
                options={options.externalProviders}
                placeholder={
                  loadingOptions
                    ? t('Loading…')
                    : t('Select external vector-store provider')
                }
                disabled={loadingOptions || !!record}
                onChange={(vectorStoreProvider) =>
                  setValues((current) => ({
                    ...current,
                    vectorStoreProvider,
                  }))
                }
              />
            </div>
          )}
          <div className='grid gap-2'>
            <Label htmlFor='knowledge-base-description'>
              {t('Description')}
            </Label>
            <Textarea
              id='knowledge-base-description'
              rows={5}
              value={values.description ?? ''}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
          {external ? (
            <div className='grid gap-2'>
              <Label htmlFor='external-provider-properties'>
                {t('Provider properties')}
              </Label>
              <Textarea
                id='external-provider-properties'
                rows={8}
                className='font-mono text-xs'
                value={externalProps}
                onChange={(event) => setExternalProps(event.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                {t(
                  'Enter provider properties as a JSON array of key and value objects.',
                )}
              </p>
            </div>
          ) : null}
          {local ? (
            <>
              <div className='flex items-center justify-between gap-4'>
                <Label>{t('Split document')}</Label>
                <Switch
                  checked={values.segmentOptions?.enabled !== false}
                  onCheckedChange={(enabled) =>
                    setValues((current) => ({
                      ...current,
                      segmentOptions: {
                        ...defaultSegmentOptions,
                        ...current.segmentOptions,
                        enabled,
                      },
                    }))
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='chunk-size'>{t('Chunk size')}</Label>
                <Input
                  id='chunk-size'
                  className='w-36'
                  type='number'
                  min={1}
                  step={100}
                  value={
                    values.segmentOptions?.chunkSize ??
                    defaultSegmentOptions.chunkSize
                  }
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      segmentOptions: {
                        ...defaultSegmentOptions,
                        ...current.segmentOptions,
                        chunkSize: Math.max(1, Number(event.target.value) || 1),
                      },
                    }))
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='chunk-overlap'>{t('Chunk overlap')}</Label>
                <Input
                  id='chunk-overlap'
                  className='w-36'
                  type='number'
                  min={0}
                  step={100}
                  value={
                    values.segmentOptions?.chunkOverlap ??
                    defaultSegmentOptions.chunkOverlap
                  }
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      segmentOptions: {
                        ...defaultSegmentOptions,
                        ...current.segmentOptions,
                        chunkOverlap: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      },
                    }))
                  }
                />
              </div>
            </>
          ) : null}
          <div className='flex items-center justify-between gap-4'>
            <Label>{t('Enabled')}</Label>
            <Switch
              checked={values.enabled !== false}
              onCheckedChange={(enabled) =>
                setValues((current) => ({ ...current, enabled }))
              }
            />
          </div>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
          <SheetFooter className='-mx-6 border-t px-6 pt-4'>
            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={saving || !values.name.trim()}>
                {saving ? t('Saving…') : t('Save')}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
