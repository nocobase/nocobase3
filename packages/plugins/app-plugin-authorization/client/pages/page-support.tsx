import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type {
  AuthorizationOptions,
  AuthorizationUser,
} from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';
import { ErrorBox, errorMessage as message } from '../components/feedback.js';

const authz = getAuthorizationClient();

// Shared by the independent Authorization settings pages.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthorizationPageData(
  optionsPath: string,
  usersPath?: string,
): {
  options?: AuthorizationOptions;
  users: readonly AuthorizationUser[];
  error?: string;
} {
  const [options, setOptions] = useState<AuthorizationOptions>();
  const [users, setUsers] = useState<readonly AuthorizationUser[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void Promise.all([
      authz.loadOptions(optionsPath),
      usersPath ? authz.loadUsers(usersPath) : Promise.resolve([]),
    ]).then(
      ([nextOptions, nextUsers]) => {
        setOptions(nextOptions);
        setUsers(nextUsers);
      },
      (cause: unknown) => setError(message(cause)),
    );
  }, [optionsPath, usersPath]);
  return { options, users, ...(error === undefined ? {} : { error }) };
}

export function AuthorizationSettingsPage(inputProps: {
  eyebrow: string;
  title: string;
  description: string;
  error?: string;
  loading: boolean;
  children: ReactNode;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { eyebrow, title, description, error, loading, children } = inputProps;

  return (
    <PageContainer
      header={
        <PageHeader eyebrow={eyebrow} title={title} description={description} />
      }
    >
      {error ? <ErrorBox value={error} /> : null}
      {loading ? (
        <div className='rounded-xl border bg-card p-8 text-sm text-muted-foreground shadow-sm'>
          {t('loading', { defaultValue: 'Loading…' })}
        </div>
      ) : (
        children
      )}
    </PageContainer>
  );
}
