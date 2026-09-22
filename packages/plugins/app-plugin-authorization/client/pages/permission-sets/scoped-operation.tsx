import { CustomFilterEditor } from '../../components/filter-editor.js';
import { emptyFilter } from '../../components/filter-ast.js';
import { useId, type RefObject, type ReactElement } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type {
  ResourceOption,
  SelectOption,
} from '../../authorization-client.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.js';
import { ScopeMark } from '../../components/scope-marks.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import type { GrantDraft } from './types.js';

export function ScopedOperation({
  container,
  item,
  action,
  config,
  grant,
  disabled,
  onToggle,
  onChange,
}: {
  container: RefObject<HTMLDivElement | null>;
  item: ResourceOption;
  action: SelectOption;
  config: NonNullable<ResourceOption['actionScopes']>[string];
  grant: GrantDraft;
  disabled: boolean;
  onToggle: (grant: GrantDraft, action: string, mode: string) => void;
  onChange: (grant: GrantDraft) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const choiceId = useId();
  const granted = grant.actions.includes(action.value);
  const unrestricted = config.fields.every(
    (field) =>
      scopeKey(
        grant.policies?.[action.value]?.[field.key],
        field.defaultValue,
      ) === 'allRecords',
  );
  return (
    <Dialog.Root modal={false}>
      <Dialog.Trigger
        className='inline-flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
        aria-label={`${item.label}: ${action.label}`}
      >
        <ScopeMark
          value={!granted ? 'none' : unrestricted ? 'all' : 'scoped'}
        />
        <span>{action.label}</span>
      </Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Popup className='absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col overflow-hidden border-l bg-white shadow-xl'>
          <header className='flex items-center justify-between border-b p-3'>
            <Dialog.Title className='text-sm font-semibold'>
              {item.label} · {action.label}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t('permissionWorkspace.backResources')}
              className='rounded-md p-1 hover:bg-muted'
            >
              <X className='size-4' />
            </Dialog.Close>
          </header>
          <div className='min-h-0 flex-1 space-y-4 overflow-auto p-4'>
            <fieldset className='space-y-3'>
              <legend className='sr-only'>
                {item.label} · {action.label}
              </legend>
              <div className='flex flex-wrap gap-6 text-sm'>
                {[false, true].map((enabled) => (
                  <label
                    key={String(enabled)}
                    className='flex cursor-pointer items-center gap-2'
                  >
                    <input
                      type='radio'
                      name={choiceId}
                      checked={granted === enabled}
                      disabled={disabled}
                      className='size-4 accent-primary'
                      onChange={() =>
                        onToggle(grant, action.value, enabled ? 'all' : 'none')
                      }
                    />
                    {t(
                      enabled
                        ? 'permissionWorkspace.configurePermission'
                        : 'permissionWorkspace.moduleNotGranted',
                    )}
                  </label>
                ))}
              </div>
              {!granted && (
                <p className='rounded-md bg-muted/30 px-3 py-3 text-sm leading-6 text-muted-foreground'>
                  {t('permissionWorkspace.noOperationGrant')}
                </p>
              )}
            </fieldset>
            {granted &&
              config.fields.map((field) => {
                const optional = config.policyType === 'resource';
                const selected = scopeKey(
                  grant.policies?.[action.value]?.[field.key],
                  field.defaultValue,
                );
                const enabled = !optional || selected !== '';
                const choices = field.options.filter(
                  (option) => !optional || option.value !== '',
                );
                const initial =
                  choices.find(
                    (option) => option.value === field.defaultValue,
                  ) ??
                  choices.find((option) => option.value !== 'allRecords') ??
                  choices[0];
                const change = (value: string) =>
                  onChange({
                    ...grant,
                    policies: {
                      ...grant.policies,
                      [action.value]: {
                        ...grant.policies?.[action.value],
                        type: config.policyType,
                        [field.key]:
                          value === 'customFilter'
                            ? { key: value, params: { filter: emptyFilter() } }
                            : value,
                      },
                    },
                  });
                return (
                  <section key={field.key} className='space-y-2 text-sm'>
                    {optional ? (
                      <label className='flex cursor-pointer items-center gap-2'>
                        <input
                          type='checkbox'
                          className='size-4 accent-primary'
                          checked={enabled}
                          disabled={disabled || !initial}
                          onChange={(event) =>
                            change(event.target.checked ? initial.value : '')
                          }
                        />
                        {t('permissionWorkspace.specifyScope', {
                          scope: field.label,
                        })}
                      </label>
                    ) : (
                      <span>{field.label}</span>
                    )}
                    {!enabled && (
                      <p className='pl-6 text-xs leading-5 text-muted-foreground'>
                        {t('permissionWorkspace.inheritScope')}
                      </p>
                    )}
                    {enabled && (
                      <div
                        className={optional ? 'space-y-2 pl-6' : 'space-y-2'}
                      >
                        <Select
                          disabled={disabled}
                          value={scopeKey(
                            grant.policies?.[action.value]?.[field.key],
                            field.defaultValue,
                          )}
                          onValueChange={(value) => {
                            if (typeof value === 'string') change(value);
                          }}
                        >
                          <SelectTrigger
                            aria-label={field.label}
                            className='w-full'
                          >
                            <SelectValue>
                              {
                                field.options.find(
                                  (option) =>
                                    option.value ===
                                    scopeKey(
                                      grant.policies?.[action.value]?.[
                                        field.key
                                      ],
                                      field.defaultValue,
                                    ),
                                )?.label
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {scopeKey(
                          grant.policies?.[action.value]?.[field.key],
                          field.defaultValue,
                        ) === 'customFilter' &&
                          field.collectionFields && (
                            <CustomFilterEditor
                              fields={field.collectionFields}
                              value={
                                grant.policies?.[action.value]?.[field.key] as {
                                  key: string;
                                  params?: unknown;
                                }
                              }
                              onChange={(recordAccess) =>
                                onChange({
                                  ...grant,
                                  policies: {
                                    ...grant.policies,
                                    [action.value]: {
                                      ...grant.policies?.[action.value],
                                      type: config.policyType,
                                      [field.key]: recordAccess,
                                    },
                                  },
                                })
                              }
                            />
                          )}
                      </div>
                    )}
                  </section>
                );
              })}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function scopeKey(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const key: unknown = Reflect.get(value, 'key');
    if (typeof key === 'string') return key;
  }
  return fallback;
}
