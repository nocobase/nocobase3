import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { localizeOptions } from '../components/localized-options.js';
import type {
  AuthorizationOptions,
  LocalizedText,
} from '../authorization-client.js';
import { useAuthorizationClient } from '../use-authorization-client.js';
import { errorMessage as message } from '../components/feedback.js';
import { useAuthorizationTranslation } from '../i18n.js';
import {
  PageError,
  PageForbidden,
  PageLoading,
} from '../components/page-shell.js';
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
  const authz = useAuthorizationClient();
  const t = useAuthorizationTranslation();
  const [state, setState] = useState<{
    options?: AuthorizationOptions<LocalizedText>;
    error?: unknown;
    forbidden?: boolean;
  }>({});
  const { t: translateOption } = useTranslation();
  const options = useMemo(
    () => state.options && localizeOptions(state.options, translateOption),
    [state.options, translateOption],
  );
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
          setState({
            error: cause,
            forbidden: status(cause) === 403,
          });
      },
    );
    return () => {
      active = false;
    };
  }, [authz, attempt, optionsPath]);
  return {
    ...state,
    options,
    error: state.error === undefined ? undefined : message(t, state.error),
    reload,
  };
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
