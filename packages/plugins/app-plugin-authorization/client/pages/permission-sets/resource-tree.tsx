import { Fragment, type ReactElement } from 'react';
import { Shield } from 'lucide-react';
import { useAuthorizationTranslation } from '../../i18n.js';
import type { GrantDraft } from './types.js';
import {
  configuredKey,
  entryConfigured,
  type WorkspaceEntry,
} from '../../components/workspace-sections.js';

export function ResourceTypeList({
  entries,
  grants,
  selected,
  onSelect,
  label,
}: {
  entries: readonly WorkspaceEntry[];
  grants: readonly GrantDraft[];
  selected: string;
  label: string;
  onSelect: (entry: string) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const granted = grants.filter((grant) => grant.actions.length > 0);
  const configured = {
    types: new Set(
      granted
        .filter((grant) => grant.resource.id === '*')
        .map((grant) => grant.resource.type),
    ),
    resources: new Set(
      granted.map((grant) =>
        configuredKey(grant.resource.type, grant.resource.id),
      ),
    ),
  };
  return (
    <nav aria-label={label} className='space-y-1 p-2'>
      {entries.map((item, index) => (
        <Fragment key={item.value}>
          {item.section !== entries[index - 1]?.section && (
            <div
              className={`px-3 pb-1 text-xs font-medium text-muted-foreground ${index > 0 ? 'mt-4 border-t pt-4' : 'pt-2'}`}
            >
              {item.sectionLabel}
            </div>
          )}
          <button
            type='button'
            aria-label={item.label}
            aria-current={selected === item.value ? 'true' : undefined}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${selected === item.value ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'}`}
            onClick={() => onSelect(item.value)}
          >
            <span className='truncate'>{item.label}</span>
            {entryConfigured(item, configured) ? (
              <span
                title={t('permissionWorkspace.configured')}
                role='img'
                aria-label={t('permissionWorkspace.configured')}
                className='shrink-0 text-muted-foreground'
              >
                <Shield className='size-3.5' aria-hidden='true' />
              </span>
            ) : null}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
