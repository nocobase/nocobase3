import { createContext, type Context } from 'react';

import type { ClientApplication } from './application.js';

export const ClientApplicationContext: Context<ClientApplication | undefined> =
  createContext<ClientApplication | undefined>(undefined);
