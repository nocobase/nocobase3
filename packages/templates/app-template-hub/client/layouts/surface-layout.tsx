import type {
  AppClientRegisteredRoute,
  AppClientRegisteredSetting,
  AppClientRegisteredSettingGroup,
} from '@nocobase/app-client/plugins';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, ChevronRight, PanelLeft, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import {
  Link,
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

import { describeSettingPage } from '../routing/client-page.js';
import { ClientPage, ClientRoute } from '../routing/client-route.js';
import { AppBrand, HeaderActions, type HeaderSurface } from '../shell/index.js';
import {
  useSurfaceAccess,
  type SurfaceNavEntry,
} from './use-surface-access.js';

/** What distinguishes one surface from another. Everything else about the two is identical. */
export interface SurfaceCopy {
  /** Which surface this is. The header drops this surface's own entry, since it is already the destination. */
  readonly surface: HeaderSurface;
  /** Labels the navigation landmark and the loading state, such as `Settings` or `Dev tools`. */
  readonly title: string;
  /** The path this surface mounts at, used to strip the prefix from nested route paths. */
  readonly pathPrefix: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

export interface SurfaceLayoutProps {
  readonly copy: SurfaceCopy;
  readonly settings: readonly AppClientRegisteredSetting[];
  readonly groups: readonly AppClientRegisteredSettingGroup[];
  /** Authenticated plugin routes nested below a page, such as a record detail page. */
  readonly routes?: readonly AppClientRegisteredRoute[];
}

/**
 * A navigable surface: a left rail of every page the user may open, and the selected page on the right. It replaces
 * the application shell rather than nesting inside it, so a surface is a place you enter and leave rather than
 * another branch of the product navigation.
 *
 * The settings centre and the dev tools are the same component with different copy, which is what keeps the two
 * feeling like one product rather than two.
 */
export function SurfaceLayout({
  copy,
  groups,
  routes = [],
  settings,
}: SurfaceLayoutProps): ReactElement {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const {
    groups: navEntries,
    settings: visible,
    loading,
  } = useSurfaceAccess(settings, groups);
  const activeRoute = routes.find((route) =>
    matchPath({ path: route.path, end: true }, location.pathname),
  );
  const active = visible.find(
    (setting) =>
      setting.path === location.pathname ||
      (activeRoute !== undefined &&
        activeRoute.path.startsWith(`${setting.path}/`)),
  );

  if (loading) {
    return <Loading className='min-h-svh' label={`Loading ${copy.title}`} />;
  }

  // The index redirect and an unknown or forbidden path both land on the first page the user can actually open, so
  // the surface never renders an empty right pane.
  if (!active) {
    return visible[0] ? (
      <Navigate to={visible[0].path} replace />
    ) : (
      <SurfaceEmpty copy={copy} />
    );
  }

  return (
    <div className='flex min-h-svh bg-background'>
      {mobileSidebarOpen ? (
        <button
          aria-label='Close navigation'
          className='fixed inset-0 z-40 bg-black/30 md:hidden'
          onClick={() => setMobileSidebarOpen(false)}
          type='button'
        />
      ) : null}
      <aside
        aria-label={`${copy.title} navigation`}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card text-card-foreground transition-[width,transform] duration-200 md:static md:z-auto md:flex md:translate-x-0 ${desktopSidebarCollapsed ? 'md:w-16' : 'md:w-64'} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-border/70 px-5 ${desktopSidebarCollapsed ? 'md:justify-center md:px-0' : ''}`}
        >
          <div className='md:hidden'>
            <AppBrand />
          </div>
          <div className='hidden md:block'>
            <AppBrand compact={desktopSidebarCollapsed} />
          </div>
          <Button
            aria-label='Close navigation'
            className='md:hidden'
            onClick={() => setMobileSidebarOpen(false)}
            size='icon'
            variant='ghost'
          >
            <X />
          </Button>
        </div>
        <nav
          aria-label={copy.title}
          className={`flex-1 space-y-1 overflow-x-hidden overflow-y-auto py-4 ${desktopSidebarCollapsed ? 'px-3 md:px-2' : 'px-3'}`}
        >
          {navEntries.map((entry) =>
            entry.kind === 'group' ? (
              <SurfaceGroupNav
                activePath={active.path}
                collapsed={desktopSidebarCollapsed}
                group={entry.group}
                key={entry.group.id}
                onNavigate={() => setMobileSidebarOpen(false)}
              />
            ) : (
              <SurfaceLink
                activePath={active.path}
                collapsed={desktopSidebarCollapsed}
                key={entry.setting.path}
                onNavigate={() => setMobileSidebarOpen(false)}
                setting={entry.setting}
              />
            ),
          )}
        </nav>
      </aside>
      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl md:px-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <Button
              aria-label='Open navigation'
              className='size-9 rounded-xl text-muted-foreground md:hidden'
              onClick={() => setMobileSidebarOpen(true)}
              size='icon'
              variant='ghost'
            >
              <PanelLeft />
            </Button>
            <Button
              aria-label={
                desktopSidebarCollapsed
                  ? 'Expand navigation'
                  : 'Collapse navigation'
              }
              aria-pressed={desktopSidebarCollapsed}
              className='hidden size-9 rounded-xl text-muted-foreground hover:text-foreground md:inline-flex'
              onClick={() =>
                setDesktopSidebarCollapsed((collapsed) => !collapsed)
              }
              size='icon'
              variant='ghost'
            >
              <PanelLeft />
            </Button>
            <div className='hidden h-5 w-px bg-border md:block' />
            <Link
              className='inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
              to='/'
            >
              <ArrowLeft className='size-4 shrink-0' />
              <span className='truncate'>Back to app</span>
            </Link>
          </div>
          <HeaderActions surface={copy.surface} />
        </header>
        <main className='min-w-0 flex-1'>
          <SurfaceMobileNav active={active} copy={copy} entries={navEntries} />
          {activeRoute ? (
            <Routes>
              <Route
                element={<ClientRoute route={activeRoute} />}
                path={activeRoute.path.replace(
                  new RegExp(`^${copy.pathPrefix}/`),
                  '',
                )}
              />
            </Routes>
          ) : (
            <ClientPage key={active.path} page={describeSettingPage(active)} />
          )}
        </main>
      </div>
    </div>
  );
}

interface SurfaceGroupNavProps {
  readonly activePath: string;
  readonly collapsed: boolean;
  readonly group: AppClientRegisteredSettingGroup;
  readonly onNavigate: () => void;
}

/** A group renders as the same disclosure the product sidebar uses, open when it holds the current page. */
function SurfaceGroupNav({
  activePath,
  collapsed,
  group,
  onNavigate,
}: SurfaceGroupNavProps): ReactElement {
  const { t } = useTranslation(group.packageName);
  const title = t(group.title, { defaultValue: group.title });
  const GroupIcon = group.icon;

  return (
    <details
      className='group'
      open={group.settings.some((setting) => setting.path === activePath)}
    >
      <summary
        className={`flex cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted [&::-webkit-details-marker]:hidden ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'}`}
        title={collapsed ? title : undefined}
      >
        <span className='flex min-w-0 items-center gap-3'>
          {GroupIcon ? (
            <SurfaceIcon>
              <GroupIcon className='size-4' />
            </SurfaceIcon>
          ) : null}
          <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>
            {title}
          </span>
        </span>
        <ChevronRight
          className={`size-4 shrink-0 transition-transform group-open:rotate-90 ${collapsed ? 'md:hidden' : ''}`}
        />
      </summary>
      <div
        className={`mt-1 ml-3 space-y-1 border-l border-border pl-2 ${collapsed ? 'md:hidden' : ''}`}
      >
        {group.settings.map((setting) => (
          <SurfaceLink
            activePath={activePath}
            collapsed={collapsed}
            key={setting.path}
            onNavigate={onNavigate}
            setting={setting}
          />
        ))}
      </div>
    </details>
  );
}

interface SurfaceLinkProps {
  readonly activePath: string;
  readonly collapsed: boolean;
  readonly onNavigate: () => void;
  readonly setting: AppClientRegisteredSetting;
}

function SurfaceLink({
  activePath,
  collapsed,
  onNavigate,
  setting,
}: SurfaceLinkProps): ReactElement {
  const { t } = useTranslation(setting.packageName);
  const title = t(setting.title, { defaultValue: setting.title });
  const isSelected = setting.path === activePath;
  const Icon = setting.icon;

  return (
    <Link
      aria-current={isSelected ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${collapsed ? 'md:justify-center md:px-2' : ''} ${isSelected ? 'bg-primary/10 font-medium text-primary' : 'text-card-foreground hover:bg-muted'}`}
      onClick={onNavigate}
      title={collapsed ? title : undefined}
      to={setting.path}
    >
      {Icon ? (
        <SurfaceIcon>
          <Icon className='size-4' />
        </SurfaceIcon>
      ) : null}
      <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>
        {title}
      </span>
    </Link>
  );
}

/** The application sizes every icon, so entries line up whatever a plugin passes. */
function SurfaceIcon({
  children,
}: {
  readonly children: ReactElement;
}): ReactElement {
  return (
    <span className='flex size-4 shrink-0 items-center justify-center [&_svg]:size-4'>
      {children}
    </span>
  );
}

interface SurfaceMobileNavProps {
  readonly active: AppClientRegisteredSetting;
  readonly copy: SurfaceCopy;
  readonly entries: readonly SurfaceNavEntry[];
}

/** The rail collapses to a select on small screens, where a 64-wide sidebar would leave no room for the page. */
function SurfaceMobileNav({
  active,
  copy,
  entries,
}: SurfaceMobileNavProps): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const selectId = `${copy.pathPrefix.replace(/^\//, '')}-page`;

  return (
    <div className='flex items-center gap-3 border-b border-border/70 px-4 py-3 md:hidden'>
      <label className='sr-only' htmlFor={selectId}>
        {copy.title} page
      </label>
      <select
        className='h-9 min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 text-sm'
        id={selectId}
        onChange={(event) => {
          void navigate(event.target.value);
        }}
        value={active.path}
      >
        {entries.map((entry) =>
          entry.kind === 'group' ? (
            <optgroup
              key={entry.group.id}
              label={t(entry.group.title, {
                defaultValue: entry.group.title,
                ns: entry.group.packageName,
              })}
            >
              {entry.group.settings.map((setting) => (
                <option key={setting.path} value={setting.path}>
                  {t(setting.title, {
                    defaultValue: setting.title,
                    ns: setting.packageName,
                  })}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={entry.setting.path} value={entry.setting.path}>
              {t(entry.setting.title, {
                defaultValue: entry.setting.title,
                ns: entry.setting.packageName,
              })}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

function SurfaceEmpty({ copy }: { readonly copy: SurfaceCopy }): ReactElement {
  return (
    <main className='grid min-h-svh place-items-center px-6'>
      <section className='w-full max-w-lg space-y-3 text-center'>
        <h1 className='text-xl font-semibold'>{copy.emptyTitle}</h1>
        <p className='text-sm text-muted-foreground'>{copy.emptyDescription}</p>
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
