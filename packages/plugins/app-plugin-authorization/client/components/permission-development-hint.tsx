import type { ReactElement } from 'react';
import { useAuthorizationTranslation } from '../i18n.js';

export function PermissionDevelopmentHint({
  category,
}: {
  category: 'pages' | 'business';
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <p className='p-6 text-sm text-muted-foreground'>
      {t(`permissionWorkspace.development.${category}`)}
    </p>
  );
}
