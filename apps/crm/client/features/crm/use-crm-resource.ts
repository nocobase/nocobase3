import { useResourceParams } from '@refinedev/core';
import { useLocation } from 'react-router';

import { getCrmResource, getCrmResourceFromPathname } from './resource-config';

export function useCrmResource() {
  const { resource, identifier } = useResourceParams();
  const { pathname } = useLocation();

  return (
    getCrmResource(resource?.name) ??
    getCrmResource(identifier) ??
    getCrmResourceFromPathname(pathname)
  );
}
