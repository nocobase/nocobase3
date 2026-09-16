import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { createContext } from 'react';

/** Share the registered Settings tree with headers on every route surface. */
export const SettingsRouteTreeContext = createContext<
  readonly AppClientRegisteredRoute[]
>([]);
