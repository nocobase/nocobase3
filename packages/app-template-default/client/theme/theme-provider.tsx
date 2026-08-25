import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes';
import type { ReactElement } from 'react';

export function AppThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  storageKey = 'nocobase-theme',
  ...props
}: ThemeProviderProps): ReactElement {
  return (
    <NextThemesProvider
      {...props}
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
    >
      {children}
    </NextThemesProvider>
  );
}
