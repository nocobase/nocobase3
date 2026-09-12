import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';

import { resolveAppUrl } from '@nocobase/app-client';

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

const DATABASE_DIALECT_LABELS: Readonly<Record<DatabaseDialect, string>> = {
  sqlite: 'SQLite',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
};

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
}: InstallPageProps): ReactElement {
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
          result.message ?? 'Unable to save the application configuration.',
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
          : 'Unable to save the application configuration.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (configured) {
    return (
      <main className='grid min-h-svh place-items-center bg-background px-6 py-12'>
        <section className='w-full max-w-lg space-y-5 rounded-2xl border bg-card p-8 text-card-foreground shadow-sm'>
          <p className='text-sm font-medium text-muted-foreground'>NocoBase</p>
          <h1 className='text-3xl font-semibold tracking-tight'>
            Configuration saved
          </h1>
          <p className='leading-7 text-muted-foreground'>
            Your database configuration has been saved. Restart the application
            to finish the installation and sign in.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className='grid min-h-svh place-items-center bg-background px-6 py-12'>
      <section className='w-full max-w-lg space-y-6 rounded-2xl border bg-card p-8 text-card-foreground shadow-sm'>
        <div className='space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>NocoBase</p>
          <h1 className='text-3xl font-semibold tracking-tight'>
            Install your application
          </h1>
          <p className='leading-7 text-muted-foreground'>
            Configure the database for this application. A secure authentication
            secret will be generated automatically.
          </p>
        </div>

        <form
          className='space-y-5'
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className='space-y-2'>
            <Label htmlFor='dialect'>Database</Label>
            <Select
              id='dialect'
              value={values.dialect}
              onValueChange={handleDialectValueChange}
            >
              <SelectTrigger>
                <SelectValue>
                  {DATABASE_DIALECT_LABELS[values.dialect]}
                </SelectValue>
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
              values.dialect === 'sqlite' ? 'Database file' : 'Database name'
            }
            value={values.database}
            onChange={(value) => updateValue('database', value)}
            required
          />

          {values.dialect !== 'sqlite' && (
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                id='host'
                label='Host'
                value={values.host}
                onChange={(value) => updateValue('host', value)}
                required
              />
              <Field
                id='port'
                label='Port'
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
                label='Username'
                value={values.username}
                onChange={(value) => updateValue('username', value)}
                required
              />
              <Field
                id='password'
                label='Password'
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
                label='Schema'
                value={values.schema}
                onChange={(value) => updateValue('schema', value)}
                required
              />
              <CheckboxField
                id='ssl'
                label='Use SSL'
                checked={values.ssl}
                onChange={(checked) => updateValue('ssl', checked)}
              />
            </div>
          )}

          {values.dialect === 'mysql' && (
            <Field
              id='charset'
              label='Character set'
              value={values.charset}
              onChange={(value) => updateValue('charset', value)}
              required
            />
          )}

          <CheckboxField
            id='debug'
            label='Enable database debug logging'
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
            {submitting ? 'Saving configuration…' : 'Save configuration'}
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
