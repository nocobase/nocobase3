import { useState, type ReactElement } from 'react';

interface SettingToggleProps {
  readonly checked: boolean;
  readonly description: string;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}

function SettingToggle({
  checked,
  description,
  label,
  onChange,
}: SettingToggleProps): ReactElement {
  return (
    <div className='flex items-start justify-between gap-6 py-5'>
      <div>
        <p className='text-sm font-medium'>{label}</p>
        <p className='mt-1 max-w-xl text-sm leading-6 text-muted-foreground'>
          {description}
        </p>
      </div>
      <button
        type='button'
        role='switch'
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

export default function AuditLogSettingsPage(): ReactElement {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<boolean>(false);
  const [retentionDays, setRetentionDays] = useState<string>('30');
  const [saved, setSaved] = useState<boolean>(false);

  const savePreview = (): void => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <main className='min-h-full bg-muted/20 px-4 py-6 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-4xl space-y-6'>
        <header>
          <div className='flex items-center gap-2 text-sm font-medium text-primary'>
            <span className='size-2 rounded-full bg-primary' />
            Plugin settings
          </div>
          <h1 className='mt-2 text-3xl font-semibold tracking-tight'>
            {'Audit Log App Plugin'}
          </h1>
          <p className='mt-2 max-w-2xl leading-7 text-muted-foreground'>
            A polished settings contribution is included so the generated plugin
            feels complete from its first run. Replace these preview values with
            your own persisted configuration.
          </p>
        </header>

        <section className='overflow-hidden rounded-2xl border bg-card shadow-sm'>
          <div className='border-b px-5 py-4 sm:px-6'>
            <h2 className='font-semibold'>General</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              Configure the default behavior of this plugin.
            </p>
          </div>
          <div className='divide-y px-5 sm:px-6'>
            <SettingToggle
              checked={enabled}
              onChange={setEnabled}
              label='Enable plugin processing'
              description='Allow the plugin service to process new application events.'
            />
            <SettingToggle
              checked={notifications}
              onChange={setNotifications}
              label='Notify administrators'
              description='Send a summary notification when the plugin detects activity that needs attention.'
            />
            <div className='grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center'>
              <div>
                <label
                  htmlFor='plugin-retention'
                  className='text-sm font-medium'
                >
                  Data retention
                </label>
                <p className='mt-1 text-sm leading-6 text-muted-foreground'>
                  Choose how long generated records remain available.
                </p>
              </div>
              <select
                id='plugin-retention'
                value={retentionDays}
                onChange={(event) => setRetentionDays(event.target.value)}
                className='h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
              >
                <option value='7'>7 days</option>
                <option value='30'>30 days</option>
                <option value='90'>90 days</option>
                <option value='365'>1 year</option>
              </select>
            </div>
          </div>
          <div className='flex flex-col gap-3 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
            <p className='text-xs text-muted-foreground'>
              Demo only — connect this form to your server service before
              shipping.
            </p>
            <button
              type='button'
              onClick={savePreview}
              className='inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90'
            >
              {saved ? 'Preview saved' : 'Save preview'}
            </button>
          </div>
        </section>

        <section className='grid gap-4 sm:grid-cols-2'>
          <article className='rounded-xl border bg-card p-5 shadow-sm'>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              Client route
            </p>
            <p className='mt-2 font-mono text-sm'>{'/audit-log'}</p>
            <p className='mt-2 text-sm leading-6 text-muted-foreground'>
              The main plugin page is registered as a lazy client contribution.
            </p>
          </article>
          <article className='rounded-xl border bg-card p-5 shadow-sm'>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              Package
            </p>
            <p className='mt-2 break-all font-mono text-sm'>
              {'@nocobase/app-plugin-audit-log'}
            </p>
            <p className='mt-2 text-sm leading-6 text-muted-foreground'>
              Keep public entry points explicit in the package exports.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
