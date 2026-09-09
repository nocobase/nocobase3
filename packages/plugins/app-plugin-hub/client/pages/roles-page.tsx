import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { Badge } from '../components/ui/badge.js';
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
          <div className='mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground'>
            <ShieldCheck className='size-4' /> {t('roles.eyebrow')}
          </div>
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
                    <TableHead className='min-w-40 text-center' key={role.key}>
                      <div className='space-y-1 py-2'>
                        <div className='font-semibold text-foreground'>
                          {t(`roles.names.${role.key}`, {
                            defaultValue: role.title ?? role.key,
                          })}
                        </div>
                        <Badge className='bg-muted text-muted-foreground'>
                          {role.key}
                        </Badge>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {HUB_ROLE_CAPABILITIES.map((capability) => (
                  <TableRow key={capability.key}>
                    <TableCell className='font-medium'>
                      {t(`roles.capabilities.${capability.key}`)}
                    </TableCell>
                    {roles.map((role) => {
                      const allowed = hasHubRoleCapability(role, capability);
                      return (
                        <TableCell className='text-center' key={role.key}>
                          {allowed ? (
                            <Check
                              aria-label={t('roles.allowed')}
                              className='mx-auto size-5 text-primary'
                            />
                          ) : (
                            <span
                              aria-label={t('roles.notAllowed')}
                              className='text-muted-foreground'
                            >
                              —
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <p className='text-sm text-muted-foreground'>{t('roles.note')}</p>
      </div>
    </main>
  );
}
