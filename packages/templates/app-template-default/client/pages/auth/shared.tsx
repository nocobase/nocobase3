import { resolveAppUrl } from '@nocobase/app-client';

import { AuthBrand } from '../../extensions/nocobase-auth-ui/components/auth-brand.js';
import { AuthMarketingPanel } from '../../extensions/nocobase-auth-ui/components/auth-marketing-panel.js';

export const authLogo = (
  <AuthBrand
    light={
      <img
        alt='NocoBase'
        className='h-10 w-auto object-contain'
        src={resolveAppUrl('/assets/logo.png')}
      />
    }
    dark={
      <img
        alt='NocoBase'
        className='h-10 w-auto object-contain'
        src={resolveAppUrl('/assets/logo-dark.png')}
      />
    }
  />
);

export const authMarketing = <AuthMarketingPanel />;
