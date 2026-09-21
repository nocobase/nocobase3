import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDownIcon, SlashIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ExamplePage, ExampleSection } from '../shared';

const customers = ['Acme Inc.', 'Globex', 'Initech', 'Umbrella'];

export default function BreadcrumbExamplePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <ExamplePage
      title={t('devComponents.breadcrumb.title')}
      description={t('devComponents.breadcrumb.description')}
      source='client/pages/dev/components/breadcrumb.tsx'
      docs='https://ui.shadcn.com/docs/components/breadcrumb'
    >
      <ExampleSection
        title={t('devComponents.breadcrumb.basic')}
        description={t('devComponents.breadcrumb.basicDescription')}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/dashboard' />}>
                {t('devComponents.breadcrumb.dashboard')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/customers' />}>
                {t('devComponents.breadcrumb.customers')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Acme Inc.</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.breadcrumb.customSeparator')}
        description={t('devComponents.breadcrumb.customSeparatorDescription')}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/dashboard' />}>
                {t('devComponents.breadcrumb.dashboard')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/orders' />}>
                {t('devComponents.breadcrumb.orders')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>ORD-1042</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.breadcrumb.dropdown')}
        description={t('devComponents.breadcrumb.dropdownDescription')}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/customers' />}>
                {t('devComponents.breadcrumb.customers')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type='button'
                      className='flex items-center gap-1 transition-colors hover:text-foreground'
                    />
                  }
                >
                  Acme Inc.
                  <ChevronDownIcon className='size-3.5' aria-hidden='true' />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  <DropdownMenuGroup>
                    {customers.map((customer) => (
                      <DropdownMenuItem key={customer}>
                        {customer}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {t('devComponents.breadcrumb.orders')}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.breadcrumb.collapsed')}
        description={t('devComponents.breadcrumb.collapsedDescription')}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/dashboard' />}>
                {t('devComponents.breadcrumb.dashboard')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size='icon-sm'
                      variant='ghost'
                      aria-label={t('devComponents.breadcrumb.showHidden')}
                    />
                  }
                >
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      render={<Link to='/dev/examples/customers' />}
                    >
                      {t('devComponents.breadcrumb.customers')}
                    </DropdownMenuItem>
                    <DropdownMenuItem>Acme Inc.</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/orders' />}>
                {t('devComponents.breadcrumb.orders')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>ORD-1042</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.breadcrumb.responsive')}
        description={t('devComponents.breadcrumb.responsiveDescription')}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/dashboard' />}>
                {t('devComponents.breadcrumb.dashboard')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className='hidden md:block' />
            <BreadcrumbItem className='hidden md:inline-flex'>
              <BreadcrumbLink render={<Link to='/dev/examples/customers' />}>
                {t('devComponents.breadcrumb.customers')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className='hidden md:block' />
            <BreadcrumbItem className='hidden md:inline-flex'>
              <BreadcrumbLink render={<Link to='/dev/examples/customers' />}>
                Acme Inc.
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to='/dev/examples/orders' />}>
                {t('devComponents.breadcrumb.orders')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>ORD-1042</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ExampleSection>
    </ExamplePage>
  );
}
