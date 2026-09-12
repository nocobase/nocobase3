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

export function AuthorizationSettingsPage({
  eyebrow,
  title,
  description,
  error,
  loading,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  error?: string;
  loading: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-6 py-7'>
        <div className='mx-auto w-full max-w-7xl'>
          <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
            {eyebrow}
          </p>
          <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
            {title}
          </h1>
          <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
            {description}
          </p>
        </div>
      </header>
      <div className='mx-auto w-full max-w-7xl space-y-5 px-6 py-6'>
        {error ? <ErrorBox value={error} /> : null}
        {loading ? (
          <div className='rounded-xl border bg-card p-8 text-sm text-muted-foreground shadow-sm'>
            Loading…
          </div>
        ) : (
          children
        )}
      </div>
    </main>
  );
}
