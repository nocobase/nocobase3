import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';

import { resolveAppUrl } from '@nocobase/app-client';
import { CheckCircle2, LoaderCircle, RotateCw } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '../components/ui/button.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';

type DatabaseDialect = 'sqlite' | 'postgres' | 'mysql';

interface InstallFormValues {
  dialect: DatabaseDialect;
  database: string;
  debug: boolean;
  host: string;
  port: string;
  username: string;
  password: string;
  schema: string;
  ssl: boolean;
  charset: string;
}

interface ConfigureResponse {
  readonly configured?: boolean;
  readonly restartRequired?: boolean;
  readonly message?: string;
}

export interface InstallPageProps {
  readonly onConfigured?: () => void;
  readonly onCheckStatus?: () => void;
  readonly checkingStatus?: boolean;
}

const initialValues: InstallFormValues = {
  dialect: 'sqlite',
  database: 'database.sqlite',
  debug: false,
  host: '127.0.0.1',
  port: '',
  username: 'postgres',
  password: '',
  schema: 'public',
  ssl: false,
  charset: 'utf8mb4',
};

export default function InstallPage({
  onConfigured,
  onCheckStatus,
  checkingStatus = false,
}: InstallPageProps): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-install');
  const [values, setValues] = useState<InstallFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [configured, setConfigured] = useState(false);

  function updateValue<Key extends keyof InstallFormValues>(
    key: Key,
    value: InstallFormValues[Key],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleDialectChange(dialect: DatabaseDialect): void {
    setValues((current) => ({
      ...current,
      dialect,
      port: dialect === 'mysql' ? '3306' : dialect === 'postgres' ? '5432' : '',
      username: dialect === 'mysql' ? 'root' : 'postgres',
      database: dialect === 'sqlite' ? 'database.sqlite' : 'app',
    }));
  }

  function handleDialectValueChange(value: string | null): void {
    if (value === 'sqlite' || value === 'postgres' || value === 'mysql') {
      handleDialectChange(value);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    const payload = {
      dialect: values.dialect,
      database: values.database,
      debug: values.debug,
      ...(values.dialect !== 'sqlite'
        ? {
            host: values.host,
            port: Number(values.port),
            username: values.username,
            password: values.password,
          }
        : {}),
      ...(values.dialect === 'postgres'
        ? { schema: values.schema, ssl: values.ssl }
        : {}),
      ...(values.dialect === 'mysql' ? { charset: values.charset } : {}),
    };

    try {
      const response = await fetch(resolveAppUrl('/install/configure'), {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ConfigureResponse;
      if (!response.ok) {
        throw new Error(
          result.message ??
            t('errors.save', {
              defaultValue: 'Unable to save the application configuration.',
            }),
        );
      }
      const configurationSaved =
        result.configured === true && result.restartRequired === true;
      setConfigured(configurationSaved);
      if (configurationSaved) {
        onConfigured?.();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t('errors.save', {
              defaultValue: 'Unable to save the application configuration.',
            }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (configured) {
    return (
      <main className='min-h-svh bg-muted/20 px-6 py-12'>
        <div className='mx-auto flex min-h-[calc(100svh-6rem)] max-w-3xl items-center justify-center'>
          <section className='w-full max-w-xl overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-lg shadow-black/5'>
            <div className='border-b bg-primary/[0.06] px-8 py-7'>
              <div className='flex items-start gap-4'>
                <div className='grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm'>
                  <CheckCircle2 className='size-6' />
                </div>
                <div className='space-y-2'>
                  <p className='text-sm font-medium text-primary'>
                    {t('success.eyebrow', { defaultValue: 'Setup complete' })}
                  </p>
                  <h1 className='text-3xl font-semibold tracking-tight'>
                    {t('success.title', {
                      defaultValue: 'Database configuration saved',
                    })}
                  </h1>
                </div>
              </div>
            </div>
            <div className='space-y-6 p-8'>
              <p className='leading-7 text-muted-foreground'>
                {t('success.description', {
                  defaultValue:
                    'Your database settings are saved. Restart the application to finish setup. This page will continue checking and take you to the sign-in screen when the application is ready.',
                })}
              </p>
              <div className='rounded-2xl border bg-muted/30 p-5'>
                <p className='text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'>
                  {t('success.nextStep', { defaultValue: 'Next step' })}
                </p>
                <div className='mt-4 flex items-start gap-3'>
                  <div className='grid size-8 shrink-0 place-items-center rounded-full bg-background text-sm font-semibold shadow-sm'>
                    1
                  </div>
                  <div className='space-y-1'>
                    <h2 className='font-medium'>
                      {t('success.restartTitle', {
                        defaultValue: 'Restart the application',
                      })}
                    </h2>
                    <p className='text-sm leading-6 text-muted-foreground'>
                      {t('success.restartDescription', {
                        defaultValue:
                          'Use your process manager or the NocoBase Hub Restart action, then return here. You do not need to submit the form again.',
                      })}
                    </p>
                  </div>
                </div>
              </div>
              <div
                aria-live='polite'
                className='flex flex-wrap items-center justify-between gap-3'
              >
                <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                  {checkingStatus ? (
                    <LoaderCircle className='size-4 animate-spin' />
                  ) : (
                    <span className='size-2 rounded-full bg-amber-500' />
                  )}
                  {t(checkingStatus ? 'success.checking' : 'success.waiting', {
                    defaultValue: checkingStatus
                      ? 'Checking application status…'
                      : 'Waiting for the application to restart…',
                  })}
                </p>
                <Button
                  disabled={checkingStatus}
                  onClick={onCheckStatus}
                  variant='outline'
                >
                  {checkingStatus ? (
                    <LoaderCircle className='size-4 animate-spin' />
                  ) : (
                    <RotateCw className='size-4' />
                  )}
                  {t('success.checkAgain', { defaultValue: 'Check again' })}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const dialectLabels: Readonly<Record<DatabaseDialect, string>> = {
    sqlite: 'SQLite',
    postgres: 'PostgreSQL',
    mysql: 'MySQL',
  };

  return (
    <main className='grid min-h-svh place-items-center bg-background px-6 py-12'>
      <section className='w-full max-w-lg space-y-6 rounded-2xl border bg-card p-8 text-card-foreground shadow-sm'>
        <div className='space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>
            {t('brand', { defaultValue: 'NocoBase setup' })}
          </p>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('form.title', { defaultValue: 'Install your application' })}
          </h1>
          <p className='leading-7 text-muted-foreground'>
            {t('form.description', {
              defaultValue:
                'Configure the database for this application. A secure authentication secret will be generated automatically.',
            })}
          </p>
        </div>

        <form
          className='space-y-5'
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className='space-y-2'>
            <Label htmlFor='dialect'>
              {t('form.database', { defaultValue: 'Database' })}
            </Label>
            <Select
              id='dialect'
              value={values.dialect}
              onValueChange={handleDialectValueChange}
            >
              <SelectTrigger>
                <SelectValue>{dialectLabels[values.dialect]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='sqlite'>SQLite</SelectItem>
                <SelectItem value='postgres'>PostgreSQL</SelectItem>
                <SelectItem value='mysql'>MySQL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Field
            id='database'
            label={
              values.dialect === 'sqlite'
                ? t('form.databaseFile', { defaultValue: 'Database file' })
                : t('form.databaseName', { defaultValue: 'Database name' })
            }
            value={values.database}
            onChange={(value) => updateValue('database', value)}
            required
          />

          {values.dialect !== 'sqlite' && (
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                id='host'
                label={t('form.host', { defaultValue: 'Host' })}
                value={values.host}
                onChange={(value) => updateValue('host', value)}
                required
              />
              <Field
                id='port'
                label={t('form.port', { defaultValue: 'Port' })}
                type='number'
                min={1}
                max={65_535}
                placeholder={values.dialect === 'mysql' ? '3306' : '5432'}
                value={values.port}
                onChange={(value) => updateValue('port', value)}
                required
              />
              <Field
                id='username'
                label={t('form.username', { defaultValue: 'Username' })}
                value={values.username}
                onChange={(value) => updateValue('username', value)}
                required
              />
              <Field
                id='password'
                label={t('form.password', { defaultValue: 'Password' })}
                type='password'
                value={values.password}
                onChange={(value) => updateValue('password', value)}
              />
            </div>
          )}

          {values.dialect === 'postgres' && (
            <div className='space-y-4'>
              <Field
                id='schema'
                label={t('form.schema', { defaultValue: 'Schema' })}
                value={values.schema}
                onChange={(value) => updateValue('schema', value)}
                required
              />
              <CheckboxField
                id='ssl'
                label={t('form.useSsl', { defaultValue: 'Use SSL' })}
                checked={values.ssl}
                onChange={(checked) => updateValue('ssl', checked)}
              />
            </div>
          )}

          {values.dialect === 'mysql' && (
            <Field
              id='charset'
              label={t('form.charset', { defaultValue: 'Character set' })}
              value={values.charset}
              onChange={(value) => updateValue('charset', value)}
              required
            />
          )}

          <CheckboxField
            id='debug'
            label={t('form.debugLogging', {
              defaultValue: 'Enable database debug logging',
            })}
            checked={values.debug}
            onChange={(checked) => updateValue('debug', checked)}
          />

          {error && (
            <p
              role='alert'
              className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
            >
              {error}
            </p>
          )}

          <Button className='w-full' type='submit' disabled={submitting}>
            {submitting
              ? t('form.saving', { defaultValue: 'Saving configuration…' })
              : t('form.save', { defaultValue: 'Save configuration' })}
          </Button>
        </form>
      </section>
    </main>
  );
}

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly type?: string;
  readonly min?: number;
  readonly max?: number;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly onChange: (value: string) => void;
}

function Field({
  id,
  label,
  value,
  type = 'text',
  min,
  max,
  placeholder,
  required = false,
  onChange,
}: FieldProps): ReactElement {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}

interface CheckboxFieldProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: CheckboxFieldProps): ReactElement {
  return (
    <label
      className='flex items-center gap-2 text-sm text-muted-foreground'
      htmlFor={id}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
