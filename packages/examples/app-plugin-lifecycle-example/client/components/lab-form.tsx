import { text } from '../../shared/text.js';
import { useState, type ReactElement } from 'react';
import type { JsonObject, JsonValue } from '@nocobase/lifecycle';
import { useTranslation } from '@nocobase/i18n/client';
import { Choice } from './choice.js';
import { Field } from './record-ui.js';
import { Textarea } from './textarea.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { NAMESPACE } from '../lib/format.js';

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  decision: ['approve', 'reject', 'abstain'],
  outcome: ['approved', 'rejected', 'returned'],
  mode: ['notify', 'receipt', 'confirmAll'],
  executionMode: ['immediate', 'scheduled'],
  failOperation: [
    '',
    'pay',
    'checkCompany',
    'createSupplierAccount',
    'runOnboardingStep',
  ],
};

function JsonField({
  value,
  onChange,
  label,
}: {
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
  readonly label: string;
}): ReactElement {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  const { t } = useTranslation(NAMESPACE);
  return (
    <div>
      <Textarea
        aria-label={label}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          try {
            const parsed: JsonValue = JSON.parse(
              event.target.value,
            ) as JsonValue;
            onChange(parsed);
            setError('');
          } catch {
            setError(t('lab.invalidJson'));
          }
        }}
        onBlur={() => {
          if (error) {
            setDraft(JSON.stringify(value, null, 2));
            setError('');
          }
        }}
      />
      {error ? (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Simple values use normal inputs; nested content is edited as named fields. */
export function LabForm({
  values,
  onChange,
  people,
  prefix = '',
  signer = false,
}: {
  readonly values: JsonObject;
  readonly onChange: (values: JsonObject) => void;
  readonly people: readonly string[];
  readonly prefix?: string;
  readonly signer?: boolean;
}): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  return (
    <div className='space-y-3'>
      {Object.entries(values).map(([key, value]) => {
        if (
          [
            'contentHash',
            'sheetHash',
            'approverId',
            'decisionComment',
            'paymentRef',
            'paidAt',
            'shipmentNo',
            'refundRef',
          ].includes(key) ||
          (value === null && ['decision'].includes(key))
        )
          return null;
        const label = t(`lab.fields.${key}`, { defaultValue: key });
        const update = (next: JsonValue): void =>
          onChange({ ...values, [key]: next });
        if (
          [
            'managers',
            'roles',
            'versions',
            'inactive',
            'delegations',
            'attachments',
          ].includes(key)
        )
          return (
            <Field key={key} label={label}>
              <JsonField value={value} label={label} onChange={update} />
            </Field>
          );
        if (Array.isArray(value))
          return (
            <ArrayField
              key={key}
              name={key}
              label={label}
              value={value}
              people={people}
              onChange={update}
            />
          );
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        )
          return (
            <fieldset key={key} className='space-y-3 rounded-lg border p-3'>
              <legend className='px-1 text-sm font-medium'>{label}</legend>
              <LabForm
                values={value}
                onChange={update}
                people={people}
                prefix={`${prefix}${key}.`}
              />
            </fieldset>
          );
        let options =
          key === 'mode' && signer
            ? ['before', 'after', 'parallel']
            : OPTIONS[key];
        if (['applicantId', 'to', 'from', 'userId', 'expertId'].includes(key))
          options = ['', ...people];
        return (
          <Field key={key} label={label}>
            {options ? (
              <Choice
                label={label}
                value={text(value ?? '')}
                options={options.map((item) => ({
                  value: item,
                  label: item
                    ? t(`lab.options.${item}`, { defaultValue: item })
                    : t('lab.choosePerson'),
                }))}
                onChange={update}
              />
            ) : typeof value === 'boolean' ? (
              <Choice
                label={label}
                value={text(value)}
                options={[
                  { value: 'true', label: t('lab.yes') },
                  { value: 'false', label: t('lab.no') },
                ]}
                onChange={(next) => update(next === 'true')}
              />
            ) : Array.isArray(value) || value === null ? (
              <JsonField label={label} value={value} onChange={update} />
            ) : (
              <Input
                aria-label={label}
                type={typeof value === 'number' ? 'number' : 'text'}
                value={text(value)}
                onChange={(event) =>
                  update(
                    typeof value === 'number'
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

function ArrayField({
  name,
  label,
  value,
  people,
  onChange,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: readonly JsonValue[];
  readonly people: readonly string[];
  readonly onChange: (value: JsonValue[]) => void;
}): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  const [rowKeys, setRowKeys] = useState(() =>
    value.map(() => crypto.randomUUID()),
  );
  const template = (): JsonValue =>
    name === 'lines'
      ? {
          id: crypto.randomUUID(),
          category: 'travel',
          description: '',
          amountCents: 0,
          approverId: null,
          contentHash: null,
          decision: null,
        }
      : name === 'items'
        ? { category: 'hardware', name: '', amount: 0 }
        : '';
  return (
    <fieldset className='space-y-3 rounded-lg border p-3'>
      <legend className='px-1 text-sm font-medium'>{label}</legend>
      {value.map((item, index) => (
        <div key={rowKeys[index]} className='space-y-2 rounded-lg border p-3'>
          {item !== null && typeof item === 'object' && !Array.isArray(item) ? (
            <LabForm
              values={item}
              people={people}
              onChange={(next) =>
                onChange(value.map((row, at) => (at === index ? next : row)))
              }
            />
          ) : name === 'recipientIds' ? (
            <Choice
              label={`${label} ${index + 1}`}
              value={text(item)}
              options={people.map((id) => ({ value: id, label: id }))}
              onChange={(next) =>
                onChange(value.map((row, at) => (at === index ? next : row)))
              }
            />
          ) : (
            <Input
              aria-label={`${label} ${index + 1}`}
              value={text(item)}
              onChange={(event) =>
                onChange(
                  value.map((row, at) =>
                    at === index ? event.target.value : row,
                  ),
                )
              }
            />
          )}
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => {
              setRowKeys((keys) => keys.filter((_, at) => at !== index));
              onChange(value.filter((_, at) => at !== index));
            }}
          >
            {t('lab.removeRow')}
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => {
          setRowKeys((keys) => [...keys, crypto.randomUUID()]);
          onChange([
            ...value,
            name === 'recipientIds' ? (people[0] ?? '') : template(),
          ]);
        }}
      >
        {t('lab.addRow')}
      </Button>
    </fieldset>
  );
}
