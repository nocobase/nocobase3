'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { translate } from '@nocobase/app-portal-sdk/i18n';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type InputPasswordProps = React.ComponentProps<'input'>;

export const InputPassword = ({ className, ...props }: InputPasswordProps) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={cn('relative')}>
      <Input
        type={showPassword ? 'text' : 'password'}
        className={cn('pr-11', className)}
        {...props}
      />
      <button
        type='button'
        aria-label={
          showPassword
            ? translate('auth.hidePassword', 'Hide password')
            : translate('auth.showPassword', 'Show password')
        }
        aria-pressed={showPassword}
        className={cn(
          'absolute inset-y-0 right-0 flex w-10 appearance-none items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
        onClick={() => setShowPassword(!showPassword)}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

InputPassword.displayName = 'InputPassword';
