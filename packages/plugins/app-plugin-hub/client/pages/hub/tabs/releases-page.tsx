import { Navigate, useLocation, useResolvedPath } from 'react-router';
import type { ReactElement } from 'react';

export default function ReleasesPage(): ReactElement {
  const parent = useResolvedPath('..');
  const location = useLocation();
  return (
    <Navigate
      replace
      to={{
        pathname: `${parent.pathname}/deployments`,
        search: location.search,
      }}
    />
  );
}
