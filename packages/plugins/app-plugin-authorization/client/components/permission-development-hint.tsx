import type { ReactElement } from 'react';
import { useAuthorizationTranslation } from '../i18n.js';

/** Where an empty built-in section's items come from. */
export function PermissionDevelopmentHint({
  section,
}: {
  section: string;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <p className='p-6 text-sm text-muted-foreground'>
      {section === 'pages' || section === 'business'
        ? t(`permissionWorkspace.development.${section}`)
        : t('permissionSets.picker.noResources')}
    </p>
  );
}
