import {
  apiClientToken,
  resolveAppUrl,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight, Check, CircleMinus, LoaderCircle } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from 'react';

import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import {
  hasHubRoleCapability,
  HUB_ROLE_CAPABILITIES,
  HUB_ROLE_CAPABILITY_GROUPS,
  type HubRoleDefinition,
} from '../roles.js';

interface HubRolesResponse {
  readonly data: readonly HubRoleDefinition[];
}

export default function RolesPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  const api = useService(apiClientToken);
  const [roles, setRoles] = useState<readonly HubRoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.request<HubRolesResponse>({
        path: 'hub/roles',
      });
      setRoles(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20 p-5 sm:p-8'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('roles.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('roles.description')}
          </p>
        </header>

        {loading ? (
          <Card className='grid min-h-64 place-items-center'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              {t('roles.loading')}
            </div>
          </Card>
        ) : error ? (
          <Card className='grid min-h-64 place-items-center p-6 text-center'>
            <div className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                {t('roles.loadFailed')}
              </p>
              <Button onClick={() => void load()} variant='outline'>
                {t('roles.retry')}
              </Button>
            </div>
          </Card>
        ) : (
          <Card className='overflow-hidden py-0'>
            <Table>
              <TableHeader>
                <TableRow className='hover:bg-transparent'>
                  <TableHead className='min-w-72'>
                    {t('roles.capability')}
                  </TableHead>
                  {roles.map((role) => (
                    <TableHead className='min-w-52 text-center' key={role.key}>
                      <div className='space-y-1 py-3'>
                        <div className='font-semibold text-foreground'>
                          {t(`roles.names.${role.key}`, {
                            defaultValue: role.title ?? role.key,
                          })}
                        </div>
                        <p className='mx-auto max-w-48 text-xs leading-5 font-normal text-muted-foreground'>
                          {t(`roles.descriptions.${role.key}`)}
                        </p>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {HUB_ROLE_CAPABILITY_GROUPS.map((group) => (
                  <Fragment key={group}>
                    <TableRow className='bg-muted/40 hover:bg-muted/40'>
                      <TableCell
                        className='py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'
                        colSpan={roles.length + 1}
                      >
                        {t(`roles.groups.${group}`)}
                      </TableCell>
                    </TableRow>
                    {HUB_ROLE_CAPABILITIES.filter(
                      (capability) => capability.group === group,
                    ).map((capability) => (
                      <TableRow key={capability.key}>
                        <TableCell className='font-medium'>
                          {t(`roles.capabilities.${capability.key}`)}
                        </TableCell>
                        {roles.map((role) => {
                          const allowed = hasHubRoleCapability(
                            role,
                            capability,
                          );
                          return (
                            <TableCell className='text-center' key={role.key}>
                              {allowed ? (
                                <Check
                                  aria-label={t('roles.allowed')}
                                  className='mx-auto size-5 text-primary'
                                />
                              ) : (
                                <CircleMinus
                                  aria-label={t('roles.notAllowed')}
                                  className='mx-auto size-4 text-muted-foreground/50'
                                />
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <section className='flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4'>
          <div className='space-y-1'>
            <h2 className='text-sm font-semibold'>{t('roles.noteTitle')}</h2>
            <p className='text-sm text-muted-foreground'>{t('roles.note')}</p>
          </div>
          <Button
            nativeButton={false}
            render={<a href={resolveAppUrl('/users')} />}
            variant='outline'
          >
            {t('roles.manageUsers')}
            <ArrowRight aria-hidden='true' />
          </Button>
        </section>
      </div>
    </main>
  );
}
