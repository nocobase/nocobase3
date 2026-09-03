import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

export default function ApplicationsRedirect(): ReactElement {
  return <Navigate replace to='/hub' />;
}
