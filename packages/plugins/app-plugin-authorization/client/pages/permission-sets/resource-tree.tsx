import { Fragment, type ReactElement } from 'react';
import { Shield } from 'lucide-react';
import { useAuthorizationTranslation } from '../../i18n.js';
import type { GrantDraft } from './types.js';
import type { ResourceTypeOption } from '../../authorization-client.js';

export function ResourceTypeList({
  types,
  grants,
  type,
  onSelect,
  label,
}: {
  types: readonly (ResourceTypeOption & { resourceType?: string })[];
  grants: readonly GrantDraft[];
  type: string;
  label: string;
  onSelect: (type: string) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const configuredTypes = new Set(
    grants
      .filter((grant) => grant.actions.length > 0)
      .map((grant) => grant.resource.type),
  );
  return (
    <nav aria-label={label} className='space-y-1 p-2'>
      {types.map((item, index) => (
        <Fragment key={item.value}>
          {item.category && item.category !== types[index - 1]?.category && (
            <div
              className={`flex items-center gap-2 px-3 pb-2 text-xs font-semibold text-foreground ${index > 0 ? 'mt-4 border-t pt-4' : 'pt-2'}`}
            >
              <span
                className='h-3 w-0.5 rounded-full bg-primary'
                aria-hidden='true'
              />
              {t(`permissionWorkspace.categories.${item.category}`)}
            </div>
          )}
          <button
            key={item.value}
            type='button'
            aria-label={item.label}
            aria-current={type === item.value ? 'true' : undefined}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${type === item.value ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => onSelect(item.value)}
          >
            <span className='truncate'>{item.label}</span>
            {configuredTypes.has(item.value) ||
            grants.some(
              (grant) =>
                grant.actions.length > 0 &&
                grant.resource.type === item.resourceType &&
                item.resources.some(
                  (resource) => resource.value === grant.resource.id,
                ),
            ) ? (
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
