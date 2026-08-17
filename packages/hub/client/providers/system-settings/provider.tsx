import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { applySystemLocale } from "@nocobase/portal-sdk/i18n";
import {
  loadSystemSettings,
  SystemSettingsContext,
  type SystemSettings,
  type SystemSettingsContextValue,
} from "@nocobase/portal-sdk/system-settings";

import { LoadingState } from "@/components/app-shell/loading-state";

export function SystemSettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<SystemSettings>();
  const [error, setError] = useState<Error>();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const nextSettings = await loadSystemSettings(force);
      await applySystemLocale(nextSettings);
      setSettings(nextSettings);
      setError(undefined);
      return nextSettings;
    } catch (reason) {
      const nextError =
        reason instanceof Error
          ? reason
          : new Error("Unable to load system settings");
      console.warn("Unable to load NocoBase system settings", reason);
      setError(nextError);
      await applySystemLocale();
      return undefined;
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<SystemSettingsContextValue>(
    () => ({
      settings,
      error,
      loading,
      refresh: () => load(true),
    }),
    [error, load, loading, settings]
  );

  if (!ready) return <LoadingState fullscreen />;

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
}
