import type { AppClient } from '@nocobase/app-sdk';
import { createContext, useContext, type Context } from 'react';

import { defaultFilesUiContextValue } from './files-ui-client';

export interface FilesUiContextValue {
  readonly buildFileUrl: (
    path: string,
    query?: Readonly<Record<string, string>>,
  ) => string;
  readonly client: AppClient;
}

export const FilesUiContext: Context<FilesUiContextValue> =
  createContext<FilesUiContextValue>(defaultFilesUiContextValue);

export function useFilesUi(): FilesUiContextValue {
  return useContext(FilesUiContext);
}
