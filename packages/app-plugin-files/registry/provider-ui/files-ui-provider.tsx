import { useMemo, type ReactElement, type ReactNode } from 'react';

import { FilesUiContext, type FilesUiContextValue } from './files-ui-context';
import { defaultFilesUiContextValue } from './files-ui-client';

export interface FilesUiProviderProps {
  readonly children: ReactNode;
  readonly value?: Partial<FilesUiContextValue>;
}

export function FilesUiProvider({
  children,
  value,
}: FilesUiProviderProps): ReactElement {
  const contextValue = useMemo<FilesUiContextValue>(
    () => ({
      buildFileUrl:
        value?.buildFileUrl ?? defaultFilesUiContextValue.buildFileUrl,
      client: value?.client ?? defaultFilesUiContextValue.client,
    }),
    [value],
  );

  return (
    <FilesUiContext.Provider value={contextValue}>
      {children}
    </FilesUiContext.Provider>
  );
}
