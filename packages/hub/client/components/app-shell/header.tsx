import {
  useActiveAuthProvider,
  useLogout,
  useTranslate,
} from '@refinedev/core';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LanguageSwitcher } from '@/components/app-shell/language-switcher';
import { UserAvatar } from '@/components/app-shell/user-avatar';
import { UserInfo } from '@/components/app-shell/user-info';
import { useSidebar, SidebarTrigger } from '@/components/ui/sidebar';
import { LogOutIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Brand } from '@/components/app-shell/brand';

export const Header = () => {
  const { isMobile } = useSidebar();

  return <>{isMobile ? <MobileHeader /> : <DesktopHeader />}</>;
};

function DesktopHeader() {
  const translate = useTranslate();

  return (
    <header
      className={cn(
        'sticky',
        'top-0',
        'flex',
        'h-16',
        'shrink-0',
        'items-center',
        'gap-4',
        'border-b',
        'border-border/70',
        'bg-background/80',
        'px-4',
        'justify-between',
        'backdrop-blur-xl',
        'z-40',
      )}
    >
      <div className='flex items-center gap-3'>
        <SidebarTrigger className='size-9 rounded-xl text-muted-foreground hover:text-foreground' />
        <div className='hidden h-5 w-px bg-border sm:block' />
        <span className='hidden text-sm font-medium text-muted-foreground sm:block'>
          {translate('shell.workspace', 'Application control plane')}
        </span>
      </div>
      <div className='flex items-center gap-2'>
        <LanguageSwitcher />
        <ThemeToggle />
        <UserDropdown />
      </div>
    </header>
  );
}

function MobileHeader() {
  const { isMobile } = useSidebar();

  return (
    <header
      className={cn(
        'sticky',
        'top-0',
        'flex',
        'h-16',
        'shrink-0',
        'items-center',
        'gap-2',
        'border-b',
        'border-border/70',
        'bg-background/85',
        'px-3',
        'justify-between',
        'backdrop-blur-xl',
        'z-40',
      )}
    >
      <SidebarTrigger
        className={cn(
          'size-9 rounded-xl text-muted-foreground',
          !isMobile && 'hidden',
        )}
      />
      <Brand logoClassName='h-6' />
      <div className='flex shrink-0 items-center gap-1'>
        <LanguageSwitcher className='size-9' />
        <ThemeToggle className='size-9' />
        <UserDropdown />
      </div>
    </header>
  );
}

const UserDropdown = () => {
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const translate = useTranslate();

  const authProvider = useActiveAuthProvider();

  if (!authProvider?.getIdentity) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <UserAvatar />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72 p-2'>
        <div className='px-2 py-2'>
          <UserInfo />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='mt-1 min-h-9 cursor-pointer gap-2 px-2 text-muted-foreground focus:text-foreground'
          onClick={() => {
            logout();
          }}
        >
          <LogOutIcon />
          <span>
            {isLoggingOut
              ? translate('auth.signingOut', 'Signing out...')
              : translate('auth.signOut', 'Sign out')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

Header.displayName = 'Header';
MobileHeader.displayName = 'MobileHeader';
DesktopHeader.displayName = 'DesktopHeader';
