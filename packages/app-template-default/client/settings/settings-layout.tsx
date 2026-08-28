import type { AppClientRegisteredSetting } from '@nocobase/app-client/plugins';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Loading } from '@/components/loading';

import { describeSettingPage } from '../routing/client-page.js';
import { ClientPage } from '../routing/client-route.js';
import { groupSettings, useSettingsAccess } from './use-settings-access.js';

export interface SettingsLayoutProps {
  readonly settings: readonly AppClientRegisteredSetting[];
}

/**
 * The settings centre: a left rail of every setting the user may open, grouped by the plugin that contributed it, and
 * the selected page on the right. It replaces the application shell rather than nesting inside it, so settings are a
 * place you enter and leave rather than another branch of the product navigation.
 */
export function SettingsLayout({
  settings,
}: SettingsLayoutProps): ReactElement {
  const location = useLocation();
  const { settings: visible, loading } = useSettingsAccess(settings);
  const active = visible.find((setting) => setting.path === location.pathname);

  if (loading) {
    return <Loading className='min-h-svh' label='Loading settings' />;
  }

  // The index redirect and an unknown or forbidden path both land on the first setting the user can actually open, so
  // the settings centre never renders an empty right pane.
  if (!active) {
    return visible[0] ? (
      <Navigate to={visible[0].path} replace />
    ) : (
      <SettingsEmpty />
    );
  }

  return (
    <div className='flex min-h-svh bg-background'>
      <aside
        aria-label='Settings navigation'
        className='hidden w-64 shrink-0 flex-col border-r border-border bg-card text-card-foreground md:flex'
      >
        <div className='flex h-16 shrink-0 items-center border-b border-border/70 px-5'>
          <Link
            className='inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
            to='/'
          >
            <ArrowLeft className='size-4' />
            Back to app
          </Link>
        </div>
        <nav
          aria-label='Settings'
          className='flex-1 space-y-4 overflow-y-auto px-3 py-4'
        >
          {groupSettings(visible).map((group) => (
            <div key={group.name}>
              <p className='px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                {group.name}
              </p>
              <div className='space-y-1'>
                {group.settings.map((setting) => (
                  <Link
                    aria-current={setting.id === active.id ? 'page' : undefined}
                    className={`block truncate rounded-lg px-3 py-2 text-sm transition-colors ${setting.id === active.id ? 'bg-primary/10 font-medium text-primary' : 'text-card-foreground hover:bg-muted'}`}
                    key={setting.id}
                    to={setting.path}
                  >
                    {setting.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className='min-w-0 flex-1'>
        <SettingsMobileNav active={active} settings={visible} />
        <ClientPage key={active.id} page={describeSettingPage(active)} />
      </main>
    </div>
  );
}

interface SettingsMobileNavProps {
  readonly active: AppClientRegisteredSetting;
  readonly settings: readonly AppClientRegisteredSetting[];
}

/** The rail collapses to a select on small screens, where a 64-wide sidebar would leave no room for the page. */
function SettingsMobileNav({
  active,
  settings,
}: SettingsMobileNavProps): ReactElement {
  const navigate = useNavigate();

  return (
    <div className='flex items-center gap-3 border-b border-border/70 px-4 py-3 md:hidden'>
      <Link
        aria-label='Back to app'
        className='inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 text-muted-foreground'
        to='/'
      >
        <ArrowLeft className='size-4' />
      </Link>
      <label className='sr-only' htmlFor='settings-page'>
        Settings page
      </label>
      <select
        className='h-9 min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 text-sm'
        id='settings-page'
        onChange={(event) => {
          void navigate(event.target.value);
        }}
        value={active.path}
      >
        {groupSettings(settings).map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.settings.map((setting) => (
              <option key={setting.id} value={setting.path}>
                {setting.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function SettingsEmpty(): ReactElement {
  return (
    <main className='grid min-h-svh place-items-center px-6'>
      <section className='w-full max-w-lg space-y-3 text-center'>
        <h1 className='text-xl font-semibold'>No settings available</h1>
        <p className='text-sm text-muted-foreground'>
          No enabled plugin contributes a settings page you have access to.
        </p>
        <Link
          className='inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline'
          to='/'
        >
          <ArrowLeft className='size-4' />
          Back to app
        </Link>
      </section>
    </main>
  );
}
