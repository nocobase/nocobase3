import type {
  AppClientRegisteredSetting,
  AppClientRegisteredSettingGroup,
} from '@nocobase/app-client/plugins';
import { useCanWithoutCache } from '@refinedev/core';
import { useEffect, useMemo, useState } from 'react';

const EMPTY_DENIALS: ReadonlySet<string> = new Set();

export interface SurfaceAccess {
  /** The pages the current user may open, flattened, in registration order. */
  readonly settings: readonly AppClientRegisteredSetting[];
  /** The same pages as a tree. A group whose children are all denied is dropped entirely. */
  readonly groups: readonly SurfaceNavEntry[];
  readonly loading: boolean;
}

/**
 * One row of the surface navigation: either a group to disclose, or a page to link to directly. An application that
 * contributes a single page without a group gets the flat form and renders as one row.
 */
export type SurfaceNavEntry =
  | { readonly kind: 'group'; readonly group: AppClientRegisteredSettingGroup }
  | { readonly kind: 'page'; readonly setting: AppClientRegisteredSetting };

/**
 * Resolves access for every registered page at once.
 *
 * `useCan` is a hook and cannot be called per setting from a list whose length varies, so this asks the access control
 * provider directly. A page that declares no `access` rule is always visible, and so is every page when no plugin
 * registered a provider at all — the surface itself is already behind authentication.
 */
export function useSurfaceAccess(
  settings: readonly AppClientRegisteredSetting[],
  groups: readonly AppClientRegisteredSettingGroup[],
): SurfaceAccess {
  const { can } = useCanWithoutCache();
  const guarded = useMemo(
    () => settings.filter((setting) => setting.access !== undefined),
    [settings],
  );
  // Nothing to ask about resolves synchronously rather than through the effect, so a surface with no guarded
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
          return result.can ? undefined : setting.path;
        } catch {
          // A provider that throws is treated as a denial rather than as an open door.
          return setting.path;
        }
      }),
    ).then((denied) => {
      if (active) {
        setResolvedDeniedIds(
          new Set(denied.filter((path) => path !== undefined)),
        );
      }
    });

    return () => {
      active = false;
    };
  }, [can, guarded, settled]);

  return useMemo(() => {
    if (deniedIds === undefined) {
      return { loading: true, settings: [], groups: [] };
    }
    const visible = settings.filter((setting) => !deniedIds.has(setting.path));
    return {
      loading: false,
      settings: visible,
      groups: buildNavEntries(visible, groups),
    };
  }, [deniedIds, groups, settings]);
}

/**
 * Rebuilds the navigation tree from the pages that survived the access check, preserving declaration order. A group
 * with nothing left in it disappears rather than rendering as an empty disclosure.
 */
export function buildNavEntries(
  visible: readonly AppClientRegisteredSetting[],
  groups: readonly AppClientRegisteredSettingGroup[],
): readonly SurfaceNavEntry[] {
  const visiblePaths = new Set(
    visible
      .filter((setting) => setting.navigation !== false)
      .map((setting) => setting.path),
  );
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const entries: SurfaceNavEntry[] = [];
  const seenGroups = new Set<string>();

  for (const setting of visible) {
    if (setting.navigation === false) {
      continue;
    }
    if (setting.groupId === undefined) {
      entries.push({ kind: 'page', setting });
      continue;
    }
    if (seenGroups.has(setting.groupId)) {
      continue;
    }
    const group = groupsById.get(setting.groupId);
    if (!group) {
      // A page naming a group nobody registered still has to be reachable, so it renders flat rather than vanishing.
      entries.push({ kind: 'page', setting });
      continue;
    }
    seenGroups.add(group.id);
    entries.push({
      kind: 'group',
      group: {
        ...group,
        settings: group.settings.filter((child) =>
          visiblePaths.has(child.path),
        ),
      },
    });
  }

  return entries;
}
