import { apiClientToken, useService } from '@nocobase/app-client';
import {
  Check,
  ChevronDown,
  CircleAlert,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  buildEditableValues,
  getAIEmployee,
  listAIEmployees,
  listAISkills,
  listAITools,
  listEnabledKnowledgeBases,
  listEnabledModels,
  hasKnowledgeBaseDataPlaceholder,
  updateAIEmployee,
  type AIEmployeeEditableValues,
  type AIEmployeeRecord,
  type AIMetadataItem,
  type EnabledModelOption,
  type KnowledgeBaseOption,
} from '../ai-employee-service.js';
import { AIEmployeeAvatar } from '../avatar.js';
import { useT } from '../locales/index.js';

type DetailTab =
  'profile' | 'role' | 'models' | 'skills' | 'tools' | 'knowledge';

const detailTabs: Array<{ key: DetailTab; label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'role', label: 'Role settings' },
  { key: 'models', label: 'Model settings' },
  { key: 'skills', label: 'Skills' },
  { key: 'tools', label: 'Tools' },
  { key: 'knowledge', label: 'Knowledge Base' },
];

const stable = (value: unknown): string => JSON.stringify(value);

function ReadonlyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: unknown;
  multiline?: boolean;
}): ReactElement {
  const text =
    typeof value === 'string' ? value : value == null ? '' : String(value);
  return (
    <label className='grid gap-1.5 text-sm'>
      <span className='font-medium'>{label}</span>
      {multiline ? (
        <textarea
          className='min-h-24 rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground'
          value={text}
          disabled
          readOnly
        />
      ) : (
        <input
          className='h-10 rounded-md border bg-muted/40 px-3 text-muted-foreground'
          value={text}
          disabled
          readOnly
        />
      )}
    </label>
  );
}

function SectionLabel({
  title,
  description,
}: {
  title: string;
  description: string;
}): ReactElement {
  return (
    <div>
      <div className='text-sm font-semibold'>{title}</div>
      <div className='text-sm text-muted-foreground'>{description}</div>
    </div>
  );
}

function EmptyList({ label }: { label: string }): ReactElement {
  return (
    <p className='rounded-md border border-dashed p-5 text-sm text-muted-foreground'>
      {label}
    </p>
  );
}

function MetadataList({
  items,
  emptyLabel,
  renderExtra,
}: {
  items: AIMetadataItem[];
  emptyLabel: string;
  renderExtra?: (item: AIMetadataItem) => ReactElement | null;
}): ReactElement {
  if (!items.length) return <EmptyList label={emptyLabel} />;
  return (
    <div className='divide-y rounded-md border'>
      {items.map((item) => (
        <div
          key={item.name}
          className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'
        >
          <div className='min-w-0'>
            <div className='font-medium'>{item.title ?? item.name}</div>
            {item.description ? (
              <div className='mt-1 text-sm text-muted-foreground'>
                {item.description}
              </div>
            ) : null}
          </div>
          {renderExtra?.(item)}
        </div>
      ))}
    </div>
  );
}

function CollapsibleSection({
  title,
  description,
  action,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  action?: ReactElement;
  children: ReactElement;
  defaultOpen?: boolean;
}): ReactElement {
  return (
    <details className='group border-b py-2' open={defaultOpen}>
      <summary className='flex cursor-pointer list-none items-center gap-3 py-3 marker:content-none'>
        <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180' />
        <div className='min-w-0 flex-1'>
          <SectionLabel title={title} description={description} />
        </div>
        {action ? (
          <div
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {action}
          </div>
        ) : null}
      </summary>
      <div className='pb-4 pl-7'>{children}</div>
    </details>
  );
}

function AddMenu({
  label,
  items,
  onAdd,
}: {
  label: string;
  items: AIMetadataItem[];
  onAdd: (name: string) => void;
}): ReactElement {
  return (
    <details className='group relative'>
      <summary
        className={`inline-flex list-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium marker:content-none ${items.length ? 'cursor-pointer bg-primary text-primary-foreground' : 'pointer-events-none bg-muted text-muted-foreground'}`}
      >
        <Plus className='h-4 w-4' /> {label}
      </summary>
      <div className='absolute right-0 z-30 mt-1 max-h-72 min-w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md'>
        {items.map((item) => (
          <button
            type='button'
            key={item.name}
            onClick={(event) => {
              onAdd(item.name);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
            className='block w-full rounded-sm px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground'
          >
            <span className='block text-sm font-medium'>
              {item.title ?? item.name}
            </span>
            {item.description ? (
              <span className='mt-1 block text-xs text-muted-foreground'>
                {item.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </details>
  );
}

function Switch({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-input'}`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function KnowledgeBaseMultiSelect({
  disabled,
  emptyLabel,
  label,
  onChange,
  options,
  placeholder,
  removeLabel,
  value,
}: {
  disabled: boolean;
  emptyLabel: string;
  label: string;
  onChange: (value: string[]) => void;
  options: KnowledgeBaseOption[];
  placeholder: string;
  removeLabel: string;
  value: string[];
}): ReactElement {
  const selectedOptions = value.map((key) => ({
    key,
    name: options.find((option) => option.key === key)?.name ?? key,
  }));
  return (
    <details
      className='group relative'
      data-disabled={disabled || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.removeAttribute('open');
        }
      }}
    >
      <summary
        aria-label={label}
        className={`flex min-h-10 list-none items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm marker:content-none ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      >
        <span className='flex min-w-0 flex-1 flex-wrap gap-1'>
          {selectedOptions.length ? (
            selectedOptions.map((option) => (
              <span
                key={option.key}
                className='inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5'
              >
                {option.name}
                <button
                  type='button'
                  aria-label={`${removeLabel} ${option.name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(value.filter((key) => key !== option.key));
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
      <div className='absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md'>
        {options.length ? (
          options.map((option) => {
            const selected = value.includes(option.key);
            return (
              <button
                type='button'
                key={option.key}
                onClick={() =>
                  onChange(
                    selected
                      ? value.filter((key) => key !== option.key)
                      : [...value, option.key],
                  )
                }
                className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground'
              >
                {option.name}
              </button>
            );
          })
        ) : (
          <p className='px-2 py-3 text-sm text-muted-foreground'>
            {emptyLabel}
          </p>
        )}
      </div>
    </details>
  );
}

function ModelMultiSelect({
  disabled,
  models,
  value,
  onChange,
  placeholder,
  removeLabel,
}: {
  disabled: boolean;
  models: EnabledModelOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  removeLabel: string;
}): ReactElement {
  const labels = new Map(
    models.map((item) => [`${item.llmService}::${item.model}`, item.label]),
  );
  const groupedModels: Array<{
    serviceTitle: string;
    models: EnabledModelOption[];
  }> = [];
  for (const model of models) {
    const group = groupedModels.find(
      (item) => item.serviceTitle === model.serviceTitle,
    );
    if (group) {
      group.models.push(model);
    } else {
      groupedModels.push({
        serviceTitle: model.serviceTitle,
        models: [model],
      });
    }
  }
  return (
    <details
      className='group relative'
      data-disabled={disabled || undefined}
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
            value.map((modelValue) => (
              <span
                key={modelValue}
                className='inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5'
              >
                {labels.get(modelValue) ?? modelValue}
                <button
                  type='button'
                  aria-label={`${removeLabel} ${labels.get(modelValue) ?? modelValue}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(value.filter((item) => item !== modelValue));
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
      <div className='absolute z-20 mt-1 max-h-[400px] w-full min-w-56 overflow-y-auto rounded-lg bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-foreground/10'>
        {groupedModels.map((group, groupIndex) => (
          <div
            key={group.serviceTitle}
            className={groupIndex ? 'border-t py-1' : 'py-1'}
          >
            <div className='px-3 py-1.5 text-xs font-medium text-muted-foreground'>
              {group.serviceTitle}
            </div>
            {group.models.map((model) => {
              const modelValue = `${model.llmService}::${model.model}`;
              const checked = value.includes(modelValue);
              return (
                <button
                  type='button'
                  key={modelValue}
                  onClick={() =>
                    onChange(
                      checked
                        ? value.filter((item) => item !== modelValue)
                        : [...value, modelValue],
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
            })}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function AIEmployeePage(): ReactElement {
  const api = useService(apiClientToken);
  const t = useT();
  const [employees, setEmployees] = useState<AIEmployeeRecord[]>([]);
  const [selectedUsername, setSelectedUsername] = useState<string>();
  const [selected, setSelected] = useState<AIEmployeeRecord>();
  const [draft, setDraft] = useState<AIEmployeeEditableValues>();
  const [models, setModels] = useState<EnabledModelOption[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>(
    [],
  );
  const [skills, setSkills] = useState<AIMetadataItem[]>([]);
  const [tools, setTools] = useState<AIMetadataItem[]>([]);
  const [tab, setTab] = useState<DetailTab>('profile');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const dirty =
    !!selected &&
    !!draft &&
    stable(draft) !== stable(buildEditableValues(selected));

  const load = useCallback(async (): Promise<void> => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    try {
      const [employeeRows, modelRows, knowledgeRows, skillRows, toolRows] =
        await Promise.all([
          listAIEmployees(controller.signal, api),
          listEnabledModels(controller.signal, api),
          listEnabledKnowledgeBases(controller.signal, api).catch(() => []),
          listAISkills(controller.signal, api),
          listAITools(controller.signal, api),
        ]);
      setEmployees(employeeRows);
      setModels(modelRows);
      setKnowledgeBases(knowledgeRows);
      setSkills(skillRows);
      setTools(toolRows);
      setSelectedUsername((current) =>
        current && employeeRows.some((item) => item.username === current)
          ? current
          : employeeRows[0]?.username,
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedUsername) {
      setSelected(undefined);
      setDraft(undefined);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setSaveError('');
    void getAIEmployee(selectedUsername, controller.signal, api)
      .then((employee) => {
        if (controller.signal.aborted) return;
        setSelected(employee);
        setDraft(buildEditableValues(employee));
        setEmployees((current) =>
          current.map((item) =>
            item.username === employee.username
              ? { ...item, ...employee }
              : item,
          ),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setSaveError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [api, selectedUsername]);

  const selectEmployee = (username: string): void => {
    if (username === selectedUsername) return;
    if (dirty && !window.confirm(t('Discard unsaved changes?'))) return;
    setSaved(false);
    setTab('profile');
    setSelectedUsername(username);
  };

  const patchDraft = (patch: Partial<AIEmployeeEditableValues>): void => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const save = async (): Promise<void> => {
    if (!selected || !draft || !dirty) return;
    if (
      draft.enableKnowledgeBase &&
      !hasKnowledgeBaseDataPlaceholder(draft.knowledgeBasePrompt)
    ) {
      setTab('knowledge');
      setSaveError(
        t('Knowledge Base Prompt must include {knowledgeBaseData}.'),
      );
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const updated = await updateAIEmployee(selected, draft, api);
      setSelected(updated);
      setDraft(buildEditableValues(updated));
      setEmployees((current) =>
        current.map((item) =>
          item.username === updated.username ? { ...item, ...updated } : item,
        ),
      );
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className='p-8 text-sm text-muted-foreground'>
        {t('Loading AI employees…')}
      </main>
    );
  }
  if (error) {
    return (
      <main className='p-8'>
        <div className='rounded-lg border border-destructive/40 p-5'>
          <p className='text-sm text-destructive'>{error}</p>
          <button
            className='mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm'
            onClick={() => void load()}
          >
            <RefreshCw className='h-4 w-4' /> {t('Retry')}
          </button>
        </div>
      </main>
    );
  }
  if (!employees.length) {
    return (
      <main className='p-8 text-center text-sm text-muted-foreground'>
        {t('No AI employees are available.')}
      </main>
    );
  }

  const selectedModels = draft?.modelSettings.models ?? [];
  const selectedModelValues = new Set(
    selectedModels.map((item) => `${item.llmService}::${item.model}`),
  );
  const selectedKnowledgeBaseKeys =
    draft?.knowledgeBase.knowledgeBaseKeys ?? [];
  const knowledgeBasePromptValid =
    !draft?.enableKnowledgeBase ||
    hasKnowledgeBaseDataPlaceholder(draft.knowledgeBasePrompt);
  const configuredSkills = draft?.skillSettings.skills ?? [];
  const configuredTools = draft?.skillSettings.tools ?? [];
  const skillsByName = new Map(skills.map((item) => [item.name, item]));
  const toolsByName = new Map(tools.map((item) => [item.name, item]));
  const generalSkills = skills.filter((item) => item.scope === 'GENERAL');
  const specifiedSkills = configuredSkills
    .map((name) => skillsByName.get(name))
    .filter(
      (item): item is AIMetadataItem => !!item && item.scope === 'SPECIFIED',
    );
  const customSkills = configuredSkills.filter((name) => {
    const item = skillsByName.get(name);
    return !item || item.scope === 'CUSTOM';
  });
  const availableCustomSkills = skills.filter(
    (item) => item.scope === 'CUSTOM' && !configuredSkills.includes(item.name),
  );
  const generalTools = tools.filter(
    (item) => item.scope === 'GENERAL' && item.from === 'loader',
  );
  const specifiedTools = configuredTools.filter((setting) => {
    const item = toolsByName.get(setting.name);
    return item && item.scope !== 'GENERAL' && item.scope !== 'CUSTOM';
  });
  const customTools = configuredTools.filter((setting) => {
    const item = toolsByName.get(setting.name);
    return !item || item.scope === 'CUSTOM';
  });
  const availableCustomTools = tools.filter(
    (item) =>
      item.scope === 'CUSTOM' &&
      !configuredTools.some((setting) => setting.name === item.name),
  );

  return (
    <main className='grid min-h-[calc(100vh-9rem)] grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)]'>
      <aside className='border-b p-4 lg:border-b-0 lg:border-r'>
        <div className='max-h-[calc(100vh-13rem)] space-y-2 overflow-y-auto pr-1'>
          {employees.map((employee) => {
            const active = employee.username === selectedUsername;
            return (
              <button
                type='button'
                key={employee.username}
                onClick={() => selectEmployee(employee.username)}
                className={`w-full rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-primary/5 shadow-sm' : 'hover:bg-muted/50'}`}
              >
                <div className='flex gap-3'>
                  <AIEmployeeAvatar
                    src={employee.avatar}
                    name={employee.nickname}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-start justify-between gap-2'>
                      <p className='truncate font-medium'>
                        {employee.nickname ?? employee.username}
                      </p>
                      <span
                        className={`mt-1 h-2 w-2 rounded-full ${employee.enabled === false ? 'bg-muted-foreground/40' : 'bg-emerald-500'}`}
                      />
                    </div>
                    <p className='truncate text-xs text-muted-foreground'>
                      @{employee.username}
                    </p>
                    {employee.position ? (
                      <p className='mt-1 truncate text-xs text-muted-foreground'>
                        {employee.position}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
          {!employees.length ? (
            <p className='p-6 text-center text-sm text-muted-foreground'>
              No AI employees.
            </p>
          ) : null}
        </div>
      </aside>

      <section className='min-w-0 p-4 sm:p-6 lg:p-8'>
        {detailLoading || !selected || !draft ? (
          <p className='text-sm text-muted-foreground'>
            {t('Loading employee details…')}
          </p>
        ) : (
          <div className='mx-auto max-w-5xl space-y-6'>
            <header className='flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center'>
              <AIEmployeeAvatar
                src={selected.avatar}
                name={selected.nickname}
                className='h-16 w-16'
              />
              <div className='min-w-0 flex-1'>
                <h2 className='truncate text-xl font-semibold'>
                  {selected.nickname ?? selected.username}
                </h2>
                <p className='text-sm text-muted-foreground'>
                  @{selected.username}
                  {selected.position ? ` · ${selected.position}` : ''}
                </p>
              </div>
              <Switch
                checked={draft.enabled}
                label={t('Enabled')}
                onCheckedChange={(enabled) => patchDraft({ enabled })}
              />
            </header>

            <div className='flex gap-1 overflow-x-auto border-b' role='tablist'>
              {detailTabs.map((item) => (
                <button
                  type='button'
                  role='tab'
                  aria-selected={tab === item.key}
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === item.key ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>

            <div className='min-h-72'>
              {tab === 'profile' ? (
                <div className='grid gap-4'>
                  <ReadonlyField
                    label={t('Username')}
                    value={selected.username}
                  />
                  <ReadonlyField
                    label={t('Nickname')}
                    value={selected.nickname}
                  />
                  <ReadonlyField
                    label={t('Position')}
                    value={selected.position}
                  />
                  <ReadonlyField
                    label={t('Bio')}
                    value={selected.bio}
                    multiline
                  />
                  <ReadonlyField
                    label={t('Greeting')}
                    value={selected.greeting}
                    multiline
                  />
                </div>
              ) : null}

              {tab === 'role' ? (
                <div className='space-y-4'>
                  <div className='flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800'>
                    <CircleAlert
                      className='mt-0.5 h-4 w-4 shrink-0'
                      aria-hidden='true'
                    />
                    <span>{t('Role setting description')}</span>
                  </div>
                  {selected.builtIn ? (
                    <fieldset className='grid gap-3 text-sm'>
                      <legend className='font-medium'>
                        {t('Role settings')}
                      </legend>
                      <div className='flex items-center gap-6'>
                        <label className='inline-flex items-center gap-2'>
                          <input
                            type='radio'
                            name='role-setting-mode'
                            checked={draft.about === null}
                            onChange={() => patchDraft({ about: null })}
                          />
                          <span>{t('System default')}</span>
                        </label>
                        <label className='inline-flex items-center gap-2'>
                          <input
                            type='radio'
                            name='role-setting-mode'
                            checked={draft.about !== null}
                            onChange={() => patchDraft({ about: '' })}
                          />
                          <span>{t('Custom')}</span>
                        </label>
                      </div>
                      {draft.about === null ? (
                        <pre className='max-h-[30rem] min-h-[20rem] whitespace-pre-wrap overflow-auto rounded-md border bg-muted/30 p-3 text-sm'>
                          {selected.defaultPrompt ?? ''}
                        </pre>
                      ) : (
                        <textarea
                          value={draft.about}
                          onChange={(event) =>
                            patchDraft({ about: event.target.value })
                          }
                          className='min-h-[20rem] w-full rounded-md border bg-background p-3'
                        />
                      )}
                    </fieldset>
                  ) : (
                    <label className='grid gap-2 text-sm'>
                      <span className='font-medium'>{t('Role settings')}</span>
                      <textarea
                        value={draft.about ?? ''}
                        onChange={(event) =>
                          patchDraft({ about: event.target.value })
                        }
                        className='min-h-[24rem] rounded-md border bg-background p-3'
                        placeholder={t('Role setting placeholder')}
                      />
                    </label>
                  )}
                </div>
              ) : null}

              {tab === 'models' ? (
                <div className='space-y-5'>
                  <div className='flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800'>
                    <CircleAlert
                      className='mt-0.5 h-4 w-4 shrink-0'
                      aria-hidden='true'
                    />
                    <span>
                      {t('Restrict this AI employee to the selected models.')}
                    </span>
                  </div>
                  <div className='grid gap-2 text-sm'>
                    <span className='font-medium'>
                      {t('Enable dedicated model configuration')}
                    </span>
                    <Switch
                      checked={draft.modelSettings.enabled === true}
                      label={t('Enable dedicated model configuration')}
                      onCheckedChange={(enabled) =>
                        patchDraft({
                          modelSettings: {
                            ...draft.modelSettings,
                            enabled,
                          },
                        })
                      }
                    />
                  </div>
                  <label className='grid gap-2 text-sm'>
                    <span className='font-medium'>{t('Models')}</span>
                    <ModelMultiSelect
                      disabled={draft.modelSettings.enabled !== true}
                      models={models}
                      value={[...selectedModelValues]}
                      placeholder={t('Select models')}
                      removeLabel={t('Remove')}
                      onChange={(values) => {
                        const next = models
                          .filter((model) =>
                            values.includes(
                              `${model.llmService}::${model.model}`,
                            ),
                          )
                          .map(({ llmService, model }) => ({
                            llmService,
                            model,
                          }));
                        patchDraft({
                          modelSettings: {
                            ...draft.modelSettings,
                            llmService: undefined,
                            model: undefined,
                            models: next,
                          },
                        });
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {tab === 'skills' ? (
                <div>
                  <CollapsibleSection
                    title={t('General skills')}
                    description={t('Shared by all AI employees.')}
                  >
                    <MetadataList
                      items={generalSkills}
                      emptyLabel={t('None configured.')}
                    />
                  </CollapsibleSection>
                  {selected.builtIn && specifiedSkills.length ? (
                    <CollapsibleSection
                      title={t('Employee-specific skills')}
                      description={t('Only available to this AI employee.')}
                    >
                      <MetadataList
                        items={specifiedSkills}
                        emptyLabel={t('None configured.')}
                      />
                    </CollapsibleSection>
                  ) : null}
                  <CollapsibleSection
                    title={t('Custom skills')}
                    description={t(
                      'Can be added to or removed from this AI employee.',
                    )}
                    action={
                      <AddMenu
                        label={t('Add skill')}
                        items={availableCustomSkills}
                        onAdd={(name) =>
                          patchDraft({
                            skillSettings: {
                              ...draft.skillSettings,
                              skills: [...configuredSkills, name],
                            },
                          })
                        }
                      />
                    }
                  >
                    <MetadataList
                      items={customSkills.map(
                        (name) =>
                          skillsByName.get(name) ?? { name, title: name },
                      )}
                      emptyLabel={t('None configured.')}
                      renderExtra={(item) => (
                        <button
                          type='button'
                          aria-label={`${t('Remove')} ${item.title ?? item.name}`}
                          className='rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground'
                          onClick={() =>
                            patchDraft({
                              skillSettings: {
                                ...draft.skillSettings,
                                skills: configuredSkills.filter(
                                  (name) => name !== item.name,
                                ),
                              },
                            })
                          }
                        >
                          <Trash2 className='h-4 w-4' />
                        </button>
                      )}
                    />
                  </CollapsibleSection>
                </div>
              ) : null}

              {tab === 'tools' ? (
                <div>
                  <CollapsibleSection
                    title={t('General tools')}
                    description={t('Shared by all AI employees.')}
                  >
                    <MetadataList
                      items={generalTools}
                      emptyLabel={t('None configured.')}
                      renderExtra={(item) => (
                        <div className='flex items-center gap-2 text-sm'>
                          <span className='text-muted-foreground'>
                            {t('Permission')}
                          </span>
                          <span className='rounded-md bg-muted px-3 py-1'>
                            {item.defaultPermission === 'ALLOW'
                              ? t('Allow')
                              : t('Ask')}
                          </span>
                        </div>
                      )}
                    />
                  </CollapsibleSection>
                  {selected.builtIn && specifiedTools.length ? (
                    <CollapsibleSection
                      title={t('Employee-specific tools')}
                      description={t('Only available to this AI employee.')}
                    >
                      <MetadataList
                        items={specifiedTools.map(
                          (setting) =>
                            toolsByName.get(setting.name) ?? {
                              name: setting.name,
                              title: setting.name,
                            },
                        )}
                        emptyLabel={t('None configured.')}
                        renderExtra={(item) => (
                          <div className='flex items-center gap-2 text-sm'>
                            <span className='text-muted-foreground'>
                              {t('Permission')}
                            </span>
                            <span className='rounded-md bg-muted px-3 py-1'>
                              {configuredTools.find(
                                (setting) => setting.name === item.name,
                              )?.autoCall
                                ? t('Allow')
                                : t('Ask')}
                            </span>
                          </div>
                        )}
                      />
                    </CollapsibleSection>
                  ) : null}
                  <CollapsibleSection
                    title={t('Custom tools')}
                    description={t(
                      'Created by workflow. You can add/remove and set default permissions.',
                    )}
                    action={
                      <AddMenu
                        label={t('Add tool')}
                        items={availableCustomTools}
                        onAdd={(name) =>
                          patchDraft({
                            skillSettings: {
                              ...draft.skillSettings,
                              tools: [
                                ...configuredTools,
                                { name, autoCall: false },
                              ],
                            },
                          })
                        }
                      />
                    }
                  >
                    <MetadataList
                      items={customTools.map(
                        (setting) =>
                          toolsByName.get(setting.name) ?? {
                            name: setting.name,
                            title: setting.name,
                          },
                      )}
                      emptyLabel={t('None configured.')}
                      renderExtra={(item) => {
                        const setting = configuredTools.find(
                          (candidate) => candidate.name === item.name,
                        );
                        return (
                          <div className='flex items-center gap-2'>
                            <span className='text-sm text-muted-foreground'>
                              {t('Permission')}
                            </span>
                            <div className='inline-flex rounded-md bg-muted p-0.5'>
                              {(['ASK', 'ALLOW'] as const).map((permission) => {
                                const active =
                                  permission ===
                                  (setting?.autoCall ? 'ALLOW' : 'ASK');
                                return (
                                  <button
                                    type='button'
                                    key={permission}
                                    onClick={() =>
                                      patchDraft({
                                        skillSettings: {
                                          ...draft.skillSettings,
                                          tools: configuredTools.map((tool) =>
                                            tool.name === item.name
                                              ? {
                                                  ...tool,
                                                  autoCall:
                                                    permission === 'ALLOW',
                                                }
                                              : tool,
                                          ),
                                        },
                                      })
                                    }
                                    className={`rounded px-3 py-1 text-sm ${active ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                                  >
                                    {permission === 'ALLOW'
                                      ? t('Allow')
                                      : t('Ask')}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type='button'
                              aria-label={`${t('Remove')} ${item.title ?? item.name}`}
                              className='rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground'
                              onClick={() =>
                                patchDraft({
                                  skillSettings: {
                                    ...draft.skillSettings,
                                    tools: configuredTools.filter(
                                      (tool) => tool.name !== item.name,
                                    ),
                                  },
                                })
                              }
                            >
                              <Trash2 className='h-4 w-4' />
                            </button>
                          </div>
                        );
                      }}
                    />
                  </CollapsibleSection>
                </div>
              ) : null}

              {tab === 'knowledge' ? (
                <div className='space-y-5'>
                  <div className='grid justify-items-start gap-2 text-sm font-medium'>
                    <span>{t('Enable Knowledge Base')}</span>
                    <Switch
                      checked={draft.enableKnowledgeBase}
                      label={t('Enable Knowledge Base')}
                      onCheckedChange={(enableKnowledgeBase) =>
                        patchDraft({ enableKnowledgeBase })
                      }
                    />
                  </div>
                  {selected.missingKnowledgeBaseKeys?.length ? (
                    <div className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800'>
                      {t('Missing Knowledge Bases')}:{' '}
                      {selected.missingKnowledgeBaseKeys.join(', ')}
                    </div>
                  ) : null}
                  <label className='grid gap-2 text-sm'>
                    <span className='font-medium'>{t('Knowledge Base')}</span>
                    <KnowledgeBaseMultiSelect
                      disabled={!draft.enableKnowledgeBase}
                      emptyLabel={t('No enabled knowledge bases.')}
                      label={t('Knowledge Base')}
                      options={knowledgeBases}
                      placeholder={t(
                        'Leave blank to retrieve from all knowledge bases',
                      )}
                      removeLabel={t('Remove')}
                      value={selectedKnowledgeBaseKeys}
                      onChange={(knowledgeBaseKeys) =>
                        patchDraft({
                          knowledgeBase: {
                            ...draft.knowledgeBase,
                            knowledgeBaseKeys,
                          },
                        })
                      }
                    />
                    <span className='text-sm text-muted-foreground'>
                      {t(
                        'Actual retrieval is limited to knowledge bases accessible to the roles of the user using this AI employee. Inaccessible knowledge bases are excluded.',
                      )}
                    </span>
                  </label>
                  <fieldset className='grid gap-3 text-sm'>
                    <legend className='mb-3 font-medium'>
                      {t('Retrieval strategy')}
                    </legend>
                    <label className='flex items-start gap-2'>
                      <input
                        className='mt-0.5 shrink-0'
                        type='radio'
                        name='retrieval-strategy'
                        value='onDemand'
                        checked={
                          draft.knowledgeBase.retrievalStrategy === 'onDemand'
                        }
                        disabled={!draft.enableKnowledgeBase}
                        onChange={() =>
                          patchDraft({
                            knowledgeBase: {
                              ...draft.knowledgeBase,
                              retrievalStrategy: 'onDemand',
                            },
                          })
                        }
                      />
                      <span>
                        <span className='block'>{t('Retrieve on demand')}</span>
                        <span className='text-muted-foreground'>
                          {t(
                            'The AI employee retrieves knowledge-base content only when it determines that it is needed.',
                          )}
                        </span>
                      </span>
                    </label>
                    <label className='flex items-start gap-2'>
                      <input
                        className='mt-0.5 shrink-0'
                        type='radio'
                        name='retrieval-strategy'
                        value='always'
                        checked={
                          draft.knowledgeBase.retrievalStrategy === 'always'
                        }
                        disabled={!draft.enableKnowledgeBase}
                        onChange={() =>
                          patchDraft({
                            knowledgeBase: {
                              ...draft.knowledgeBase,
                              retrievalStrategy: 'always',
                            },
                          })
                        }
                      />
                      <span>
                        <span className='block'>
                          {t('Automatically retrieve for every question')}
                        </span>
                        <span className='text-muted-foreground'>
                          {t(
                            'Retrieve before every user question, then answer with the retrieved content.',
                          )}
                        </span>
                      </span>
                    </label>
                  </fieldset>
                  <label className='grid gap-2 text-sm'>
                    <span className='font-medium'>
                      {t('Knowledge Base Prompt')}
                    </span>
                    <textarea
                      disabled={!draft.enableKnowledgeBase}
                      value={draft.knowledgeBasePrompt}
                      onChange={(event) =>
                        patchDraft({ knowledgeBasePrompt: event.target.value })
                      }
                      aria-invalid={!knowledgeBasePromptValid}
                      className={`min-h-28 rounded-lg border bg-background p-3 disabled:opacity-50 ${knowledgeBasePromptValid ? '' : 'border-destructive'}`}
                    />
                    {!knowledgeBasePromptValid ? (
                      <span className='text-sm text-destructive'>
                        {t(
                          'Knowledge Base Prompt must include {knowledgeBaseData}.',
                        )}
                      </span>
                    ) : null}
                  </label>
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <label className='grid gap-2 text-sm'>
                      <span className='font-medium'>Top K</span>
                      <input
                        type='number'
                        min={1}
                        disabled={!draft.enableKnowledgeBase}
                        value={draft.knowledgeBase.topK ?? 5}
                        onChange={(event) =>
                          patchDraft({
                            knowledgeBase: {
                              ...draft.knowledgeBase,
                              topK: Number(event.target.value),
                            },
                          })
                        }
                        className='h-10 rounded-md border bg-background px-3 disabled:opacity-50'
                      />
                      <span className='text-muted-foreground'>
                        {t(
                          'Maximum number of knowledge-base entries returned for each retrieval.',
                        )}
                      </span>
                    </label>
                    <label className='grid gap-2 text-sm'>
                      <span className='font-medium'>{t('Score')}</span>
                      <input
                        type='number'
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={!draft.enableKnowledgeBase}
                        value={draft.knowledgeBase.score ?? 0.5}
                        onChange={(event) =>
                          patchDraft({
                            knowledgeBase: {
                              ...draft.knowledgeBase,
                              score: Number(event.target.value),
                            },
                          })
                        }
                        className='h-10 rounded-md border bg-background px-3 disabled:opacity-50'
                      />
                      <span className='text-muted-foreground'>
                        {t(
                          'Minimum similarity score for knowledge-base content to be included in retrieval results.',
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>

            {saveError ? (
              <p className='rounded-md border border-destructive/40 p-3 text-sm text-destructive'>
                {saveError}
              </p>
            ) : null}
            {saved ? (
              <p className='text-sm text-emerald-600'>{t('Changes saved.')}</p>
            ) : null}
            {dirty ? (
              <footer className='sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-4 backdrop-blur'>
                <button
                  type='button'
                  className='inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm'
                  onClick={() => {
                    setDraft(buildEditableValues(selected));
                    setSaveError('');
                  }}
                >
                  <Undo2 className='h-4 w-4' /> {t('Cancel')}
                </button>
                <button
                  type='button'
                  disabled={saving}
                  className='inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50'
                  onClick={() => void save()}
                >
                  <Save className='h-4 w-4' />{' '}
                  {saving ? t('Saving…') : t('Save')}
                </button>
              </footer>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
