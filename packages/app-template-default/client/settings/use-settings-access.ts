import type { AppClientRegisteredSetting } from '@nocobase/app-client/plugins';
import { useCanWithoutCache } from '@refinedev/core';
import { useEffect, useMemo, useState } from 'react';

const EMPTY_DENIALS: ReadonlySet<string> = new Set();

export interface SettingsAccess {
  /** The settings the current user may open, in registration order. */
  readonly settings: readonly AppClientRegisteredSetting[];
  readonly loading: boolean;
}

/**
 * Resolves access for every registered setting at once.
 *
 * `useCan` is a hook and cannot be called per setting from a list whose length varies, so this asks the access control
 * provider directly. A setting that declares no `access` rule is always visible, and so is every setting when no
 * plugin registered a provider at all — the settings centre itself is already behind authentication.
 */
export function useSettingsAccess(
  settings: readonly AppClientRegisteredSetting[],
): SettingsAccess {
  const { can } = useCanWithoutCache();
  const guarded = useMemo(
    () => settings.filter((setting) => setting.access !== undefined),
    [settings],
  );
  // Nothing to ask about resolves synchronously rather than through the effect, so a settings centre with no guarded
  // pages renders on its first pass instead of flashing its loading state.
  const settled = !can || guarded.length === 0;
  const [resolvedDeniedIds, setResolvedDeniedIds] =
    useState<ReadonlySet<string>>();
  const deniedIds = settled ? EMPTY_DENIALS : resolvedDeniedIds;

  useEffect(() => {
    if (settled) {
      return;
    }
    let active = true;

    void Promise.all(
      guarded.map(async (setting) => {
        try {
          const result = await can({
            resource: setting.access?.resource,
            action: setting.access?.action ?? 'read',
          });
          return result.can ? undefined : setting.id;
        } catch {
          // A provider that throws is treated as a denial rather than as an open door.
          return setting.id;
        }
      }),
    ).then((denied) => {
      if (active) {
        setResolvedDeniedIds(new Set(denied.filter((id) => id !== undefined)));
      }
    });

    return () => {
      active = false;
    };
  }, [can, guarded, settled]);

  return useMemo(
    () => ({
      loading: deniedIds === undefined,
      settings:
        deniedIds === undefined
          ? []
          : settings.filter((setting) => !deniedIds.has(setting.id)),
    }),
    [deniedIds, settings],
  );
}

export interface SettingsGroup {
  readonly name: string;
  readonly settings: readonly AppClientRegisteredSetting[];
}

/** Groups settings by their `group`, keeping both groups and their members in registration order. */
export function groupSettings(
  settings: readonly AppClientRegisteredSetting[],
): readonly SettingsGroup[] {
  const groups = new Map<string, AppClientRegisteredSetting[]>();
  for (const setting of settings) {
    const existing = groups.get(setting.group);
    if (existing) {
      existing.push(setting);
    } else {
      groups.set(setting.group, [setting]);
    }
  }
  return [...groups].map(([name, grouped]) => ({ name, settings: grouped }));
}
