'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTranslate } from '@refinedev/core';
import { useTheme } from '@/components/theme/theme-provider';

export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme = 'light' } = useTheme();
  const translate = useTranslate();

  return (
    <Sonner
      containerAriaLabel={translate('ui.notifications.label', 'Notifications')}
      theme={resolvedTheme as ToasterProps['theme']}
      className='toaster group'
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
