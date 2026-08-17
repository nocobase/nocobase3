"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from "next-themes";

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "light",
  enableSystem = true,
  storageKey = "nocobase-theme",
  ...props
}: ThemeProviderProps) {
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

export { useTheme };

ThemeProvider.displayName = "ThemeProvider";
