import {
  appApiClientToken,
  useService,
  type AppClient,
} from '@nocobase/app-client';
import { Check, ChevronDown, CircleAlert, Pencil, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  listLLMProviders,
  listLLMServices,
  listProviderModels,
  normalizeEnabledModels,
  prepareEnabledModels,
  updateLLMService,
  type EnabledModel,
  type EnabledModelsConfig,
  type LLMService,
  type LLMProvider,
} from '../llm-service-service.js';

export default function LLMServicePage(): ReactElement {
  const appClient = useService(appApiClientToken);
  const [services, setServices] = useState<LLMService[]>([]);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<LLMService>();
  useEffect(() => {
    void Promise.all([listLLMServices(appClient), listLLMProviders(appClient)])
      .then(([nextServices, nextProviders]) => {
        setServices(nextServices);
        setProviders(nextProviders);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [appClient]);
  const toggle = async (service: LLMService, enabled: boolean) => {
    setServices((items) =>
      items.map((item) =>
        item.name === service.name ? { ...item, enabled } : item,
      ),
    );
    try {
      await updateLLMService(service.name, { enabled }, appClient);
    } catch (e) {
      setServices((items) =>
        items.map((item) => (item.name === service.name ? service : item)),
      );
      setError(String(e));
    }
  };
  return (
    <main className='px-3 py-4 sm:px-4'>
      {error && (
        <div
          role='alert'
          className='mb-3 rounded-md border border-destructive p-3 text-sm'
        >
          {error}
        </div>
      )}
      <div className='overflow-hidden rounded-lg border'>
        <table className='w-full text-left text-sm'>
          <thead className='bg-muted/40'>
            <tr>
              <th className='px-3 py-2.5'>UID</th>
              <th className='px-3 py-2.5'>Title</th>
              <th className='px-3 py-2.5'>Provider</th>
              <th className='px-3 py-2.5'>Models</th>
              <th className='px-3 py-2.5'>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.name} className='border-t'>
                <td className='px-3 py-2.5 font-mono text-xs'>
                  {service.name}
                </td>
                <td className='px-3 py-2.5'>{service.title}</td>
                <td className='px-3 py-2.5'>
                  <ProviderCell
                    name={service.provider}
                    provider={providers.find(
                      (item) => item.name === service.provider,
                    )}
                  />
                </td>
                <td className='px-3 py-2.5'>
                  <ModelsCell
                    service={service}
                    provider={providers.find(
                      (item) => item.name === service.provider,
                    )}
                    onEdit={() => setEditing(service)}
                  />
                </td>
                <td className='px-3 py-2.5'>
                  <Switch
                    checked={service.enabled}
                    label={`Enable ${service.name}`}
                    onCheckedChange={(enabled) => void toggle(service, enabled)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ModelEditor
          appClient={appClient}
          service={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(next) => {
            setServices((items) =>
              items.map((item) => (item.name === next.name ? next : item)),
            );
            setEditing(undefined);
          }}
        />
      )}
    </main>
  );
}

function ProviderCell({
  name,
  provider,
}: {
  name: string;
  provider?: LLMProvider;
}): ReactElement {
  const supportedModel = provider?.supportedModel ?? ['LLM'];
  return (
    <div className='min-w-0'>
      <div className='truncate'>{provider?.title ?? name}</div>
      <div className='mt-1 flex flex-wrap gap-1'>
        {supportedModel.map((modelType) => (
          <span
            key={modelType}
            className='rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'
          >
            {modelType === 'EMBEDDING' ? 'Embedding' : 'LLM'}
          </span>
        ))}
      </div>
    </div>
  );
}

function ModelsCell({
  service,
  provider,
  onEdit,
}: {
  service: LLMService;
  provider?: LLMProvider;
  onEdit: () => void;
}): ReactElement {
  const config = normalizeEnabledModels(service.enabledModels);
  const models =
    config.mode === 'recommended'
      ? (provider?.recommendedModels ?? [])
      : config.models;
  return (
    <div className='flex max-w-xl items-start gap-2'>
      <button
        type='button'
        aria-label={`Edit models for ${service.name}`}
        title='Edit models'
        className='mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        onClick={onEdit}
      >
        <Pencil className='h-4 w-4' />
      </button>
      <div className='flex min-w-0 flex-wrap gap-1'>
        {models.length ? (
          models.map((model) => (
            <span
              key={model.value}
              title={model.value}
              className='max-w-48 truncate rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'
            >
              {model.label}
            </span>
          ))
        ) : (
          <span className='py-0.5 text-xs text-muted-foreground'>
            No models
          </span>
        )}
      </div>
    </div>
  );
}
function Switch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checked ? 'bg-primary' : 'bg-input'}`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function ModelMultiSelect({
  disabled,
  loading,
  models,
  value,
  onChange,
  onSearch,
  placeholder,
  removeLabel,
}: {
  disabled: boolean;
  loading: boolean;
  models: EnabledModel[];
  value: EnabledModel[];
  onChange: (value: EnabledModel[]) => void;
  onSearch: (value: string) => void;
  placeholder: string;
  removeLabel: string;
}): ReactElement {
  const searchInputRef = useRef<HTMLInputElement>(null);
  return (
    <details
      className='group relative'
      data-disabled={disabled || undefined}
      onToggle={(event) => {
        if (event.currentTarget.open) searchInputRef.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary
        className={`flex min-h-10 list-none items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm marker:content-none ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      >
        <span className='flex min-w-0 flex-1 flex-wrap gap-1'>
          {value.length ? (
            value.map((model) => (
              <span
                key={model.value}
                className='inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5'
              >
                {model.label}
                <button
                  type='button'
                  aria-label={`${removeLabel} ${model.label}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(
                      value.filter((item) => item.value !== model.value),
                    );
                  }}
                  className='rounded-sm text-muted-foreground hover:text-foreground'
                >
                  <X className='h-3 w-3' />
                </button>
              </span>
            ))
          ) : (
            <span className='text-muted-foreground'>{placeholder}</span>
          )}
        </span>
        <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180' />
      </summary>
      <div className='absolute z-20 mt-1 w-full min-w-56 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10'>
        <div className='border-b p-2'>
          <input
            ref={searchInputRef}
            type='search'
            className='w-full rounded border bg-background px-3 py-2 text-sm'
            aria-label='Search provider models'
            placeholder='Search models'
            onChange={(event) => onSearch(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        <div className='max-h-[340px] overflow-y-auto py-1'>
          {loading ? (
            <p className='px-3 py-2 text-sm text-muted-foreground'>Loading…</p>
          ) : models.length ? (
            models.map((model) => {
              const checked = value.some((item) => item.value === model.value);
              return (
                <button
                  type='button'
                  key={model.value}
                  onClick={() =>
                    onChange(
                      checked
                        ? value.filter((item) => item.value !== model.value)
                        : [...value, model],
                    )
                  }
                  className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-3 pl-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground ${checked ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <span className='flex h-4 w-4 shrink-0 items-center justify-center'>
                    {checked ? <Check className='h-4 w-4' /> : null}
                  </span>
                  <span className='block min-w-0 truncate' title={model.label}>
                    {model.label}
                  </span>
                </button>
              );
            })
          ) : (
            <p className='px-3 py-2 text-sm text-muted-foreground'>No models</p>
          )}
        </div>
      </div>
    </details>
  );
}

function ModelEditor({
  appClient,
  service,
  onClose,
  onSaved,
}: {
  appClient: AppClient;
  service: LLMService;
  onClose: () => void;
  onSaved: (service: LLMService) => void;
}): ReactElement {
  const [config, setConfig] = useState<EnabledModelsConfig>(() => {
    const normalized = normalizeEnabledModels(service.enabledModels);
    return normalized.mode === 'custom'
      ? normalized
      : { mode: 'provider', models: normalized.models };
  });
  const nextCustomModelKeyRef = useRef(config.models.length);
  const [customModelKeys, setCustomModelKeys] = useState<string[]>(() =>
    config.models.map((_, index) => `${service.name}-model-${index}`),
  );
  const [providerModels, setProviderModels] = useState<EnabledModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const modelRequestRef = useRef(0);

  const loadProviderModels = useCallback(
    async (searchValue: string): Promise<void> => {
      const request = ++modelRequestRef.current;
      setLoading(true);
      try {
        const models = await listProviderModels(
          service.name,
          searchValue,
          appClient,
        );
        if (request === modelRequestRef.current) setProviderModels(models);
      } catch (loadError) {
        if (request === modelRequestRef.current) setError(String(loadError));
      } finally {
        if (request === modelRequestRef.current) setLoading(false);
      }
    },
    [appClient, service.name],
  );

  useEffect(() => {
    void loadProviderModels('');
  }, [loadProviderModels]);

  const save = async (): Promise<void> => {
    try {
      const enabledModels = prepareEnabledModels(config);
      onSaved(
        await updateLLMService(service.name, { enabledModels }, appClient),
      );
    } catch (saveError) {
      setError(String(saveError));
    }
  };

  return (
    <div
      role='dialog'
      aria-label='Edit models'
      className='fixed inset-0 grid place-items-center bg-black/30 p-4'
    >
      <div className='w-full max-w-xl space-y-5 rounded-lg bg-background p-6 shadow-lg'>
        <div>
          <h3 className='text-lg font-semibold'>Edit models</h3>
        </div>
        <div className='flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800'>
          <CircleAlert className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
          <span>
            Configure LLM models. Embedding models do not need to be added.
          </span>
        </div>
        <fieldset className='space-y-4'>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='radio'
              name='model-mode'
              value='provider'
              checked={config.mode === 'provider'}
              onChange={() => {
                setConfig({ mode: 'provider', models: [] });
                void loadProviderModels('');
              }}
            />
            Select models
          </label>
          {config.mode === 'provider' && (
            <div className='space-y-2 pl-6'>
              <ModelMultiSelect
                disabled={false}
                loading={loading}
                models={providerModels}
                value={config.models}
                onSearch={(value) => void loadProviderModels(value)}
                onChange={(models) => setConfig({ mode: 'provider', models })}
                placeholder='Select models to enable'
                removeLabel='Remove'
              />
            </div>
          )}
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='radio'
              name='model-mode'
              value='custom'
              checked={config.mode === 'custom'}
              onChange={() => {
                setConfig({ mode: 'custom', models: [] });
                setCustomModelKeys([]);
              }}
            />
            Manual input
          </label>
          {config.mode === 'custom' && (
            <div className='space-y-2 pl-6'>
              {config.models.map((model, index) => (
                <div key={customModelKeys[index]} className='flex gap-2'>
                  <input
                    className='min-w-0 flex-1 rounded border px-3 py-2 text-sm'
                    aria-label='Model ID'
                    placeholder='Model id'
                    value={model.value}
                    onChange={(event) =>
                      setConfig({
                        mode: 'custom',
                        models: config.models.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <input
                    className='min-w-0 flex-1 rounded border px-3 py-2 text-sm'
                    aria-label='Model label'
                    placeholder='Display name'
                    value={model.label}
                    onChange={(event) =>
                      setConfig({
                        mode: 'custom',
                        models: config.models.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    type='button'
                    aria-label={`Remove model ${index + 1}`}
                    className='rounded px-2 text-muted-foreground hover:bg-muted'
                    onClick={() => {
                      setConfig({
                        mode: 'custom',
                        models: config.models.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      });
                      setCustomModelKeys((keys) =>
                        keys.filter((_, itemIndex) => itemIndex !== index),
                      );
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type='button'
                className='w-full rounded border border-dashed px-3 py-2 text-sm'
                onClick={() => {
                  const key = `${service.name}-model-${nextCustomModelKeyRef.current++}`;
                  setConfig({
                    mode: 'custom',
                    models: [...config.models, { label: '', value: '' }],
                  });
                  setCustomModelKeys((keys) => [...keys, key]);
                }}
              >
                Add model
              </button>
            </div>
          )}
        </fieldset>
        {error && (
          <div role='alert' className='text-sm text-destructive'>
            {error}
          </div>
        )}
        <div className='flex justify-end gap-2'>
          <button
            type='button'
            className='rounded border px-3 py-1.5 text-sm'
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type='button'
            className='rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground'
            onClick={() => void save()}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
