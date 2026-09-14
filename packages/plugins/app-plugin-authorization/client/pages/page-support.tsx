import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';
import { ErrorBox, errorMessage as message } from '../components/feedback.js';
import {
  unavailableUserDirectory,
  userDirectory,
  type UserDirectory,
} from '../components/user-directory.js';

const authz = getAuthorizationClient();

// Shared by the independent Authorization settings pages.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthorizationPageData(optionsPath: string): {
  options?: AuthorizationOptions;
  error?: string;
} {
  const [options, setOptions] = useState<AuthorizationOptions>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void authz
      .loadOptions(optionsPath)
      .then(setOptions, (cause: unknown) => setError(message(cause)));
  }, [optionsPath]);
  return { options, ...(error === undefined ? {} : { error }) };
}

/**
 * Users are read from the Users API, which authorizes separately from these
 * pages, so a refusal degrades the page instead of failing it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useUserDirectory(): UserDirectory {
  const [users, setUsers] = useState<UserDirectory>(() => userDirectory([]));
  useEffect(() => {
    void authz
      .listUsers()
      .then(userDirectory, unavailableUserDirectory)
      .then(setUsers);
  }, []);
  return users;
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
