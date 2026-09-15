import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AuthorizationOptions } from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';
import { errorMessage as message } from '../components/feedback.js';
import {
  PageError,
  PageForbidden,
  PageLoading,
} from '../components/page-shell.js';
import {
  unavailableUserDirectory,
  userDirectory,
  type UserDirectory,
} from '../components/user-directory.js';

const authz = getAuthorizationClient();

/** What a settings page knows before its options have arrived. */
export interface AuthorizationPageData {
  readonly options?: AuthorizationOptions;
  readonly error?: string;
  /** The options request was refused rather than failed. */
  readonly forbidden?: boolean;
  readonly reload: () => void;
}

// Shared by the independent Authorization settings pages.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthorizationPageData(
  optionsPath: string,
): AuthorizationPageData {
  const [state, setState] = useState<Omit<AuthorizationPageData, 'reload'>>({});
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setState({});
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    void authz.loadOptions(optionsPath).then(
      (options) => {
        if (active) setState({ options });
      },
      (cause: unknown) => {
        if (active)
          setState({ error: message(cause), forbidden: status(cause) === 403 });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, optionsPath]);
  return { ...state, reload };
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

/** What a page shows while its options are loading, refused, or failed. */
export function AuthorizationPageState({
  error,
  forbidden,
  reload,
}: AuthorizationPageData): ReactElement {
  if (error === undefined) return <PageLoading />;
  return forbidden === true ? (
    <PageForbidden message={error} />
  ) : (
    <PageError message={error} onRetry={reload} />
  );
}

function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value: unknown = Reflect.get(error, 'status');
  return typeof value === 'number' ? value : undefined;
}
