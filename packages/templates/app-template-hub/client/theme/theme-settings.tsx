import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

export function ThemeSettings(): ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  return (
    <Button
      aria-label={`Switch to ${nextTheme} theme`}
      className='relative size-10 rounded-xl border-border/70 bg-background/60'
      onClick={() => setTheme(nextTheme)}
      size='icon'
      title={`Switch to ${nextTheme} theme`}
      variant='outline'
    >
      <Sun
        aria-hidden='true'
        className={`size-5 transition-all duration-200 ${isDark ? '-rotate-90 scale-0' : 'rotate-0 scale-100'}`}
      />
      <Moon
        aria-hidden='true'
        className={`absolute size-5 transition-all duration-200 ${isDark ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}
      />
    </Button>
  );
}
