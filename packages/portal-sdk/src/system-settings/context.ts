import { createContext, useContext } from "react";

export type SystemSettings = Record<string, unknown> & {
  appLang?: string | null;
  enabledLanguages?: string[] | null;
};

export type SystemSettingsContextValue = {
  settings?: SystemSettings;
  error?: Error;
  loading: boolean;
  refresh: () => Promise<SystemSettings | undefined>;
};

export const SystemSettingsContext =
  createContext<SystemSettingsContextValue | null>(null);

export function useSystemSettings() {
  const value = useContext(SystemSettingsContext);
  if (!value) {
    throw new Error(
      "useSystemSettings must be used inside SystemSettingsProvider"
    );
  }
  return value;
}
