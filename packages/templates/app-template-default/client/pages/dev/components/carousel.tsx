import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

import { ExamplePage, ExampleSection } from '../shared';

const products = [
  {
    id: 'headphones',
    name: 'Studio Headphones',
    price: '$199.00',
    category: 'Audio',
  },
  { id: 'dock', name: 'USB-C Dock', price: '$129.00', category: 'Accessories' },
  {
    id: 'keyboard',
    name: 'Mechanical Keyboard',
    price: '$149.00',
    category: 'Input',
  },
  {
    id: 'monitor',
    name: '27" Monitor',
    price: '$429.00',
    category: 'Displays',
  },
  {
    id: 'chair',
    name: 'Ergonomic Chair',
    price: '$649.00',
    category: 'Furniture',
  },
];

const announcements = [
  {
    id: 'n1',
    titleKey: 'devComponents.carousel.announcementMaintenance',
    date: 'Sep 20',
  },
  {
    id: 'n2',
    titleKey: 'devComponents.carousel.announcementExports',
    date: 'Sep 14',
  },
  {
    id: 'n3',
    titleKey: 'devComponents.carousel.announcementRoles',
    date: 'Sep 8',
  },
  {
    id: 'n4',
    titleKey: 'devComponents.carousel.announcementApi',
    date: 'Sep 1',
  },
];

const onboardingSteps = [
  {
    id: 's1',
    titleKey: 'devComponents.carousel.stepWorkspace',
    bodyKey: 'devComponents.carousel.stepWorkspaceBody',
  },
  {
    id: 's2',
    titleKey: 'devComponents.carousel.stepInvite',
    bodyKey: 'devComponents.carousel.stepInviteBody',
  },
  {
    id: 's3',
    titleKey: 'devComponents.carousel.stepImport',
    bodyKey: 'devComponents.carousel.stepImportBody',
  },
  {
    id: 's4',
    titleKey: 'devComponents.carousel.stepDone',
    bodyKey: 'devComponents.carousel.stepDoneBody',
  },
];

export default function CarouselExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    if (!api) return;
    const onSelect = (): void => {
      setCurrent(api.selectedScrollSnap() + 1);
    };
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  return (
    <ExamplePage
      title={t('devComponents.carousel.title')}
      description={t('devComponents.carousel.description')}
      source='client/pages/dev/components/carousel.tsx'
      docs='https://ui.shadcn.com/docs/components/carousel'
    >
      <ExampleSection
        title={t('devComponents.carousel.basic')}
        description={t('devComponents.carousel.basicDescription')}
        contentClassName='justify-center px-16'
      >
        <Carousel className='w-full max-w-xs'>
          <CarouselContent>
            {products.map((product) => (
              <CarouselItem key={product.id}>
                <Card size='sm' className='m-px'>
                  <CardHeader>
                    <CardDescription>{product.category}</CardDescription>
                    <CardTitle>{product.name}</CardTitle>
                  </CardHeader>
                  <CardContent className='flex aspect-square items-end'>
                    <span className='text-3xl font-semibold tabular-nums'>
                      {product.price}
                    </span>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious aria-label={t('devCommon.previous')} />
          <CarouselNext aria-label={t('devCommon.next')} />
        </Carousel>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.carousel.multiple')}
        description={t('devComponents.carousel.multipleDescription')}
        contentClassName='justify-center px-16'
      >
        <Carousel opts={{ align: 'start' }} className='w-full max-w-md'>
          <CarouselContent className='-ml-2'>
            {products.map((product) => (
              <CarouselItem
                key={product.id}
                className='basis-1/2 pl-2 lg:basis-1/3'
              >
                <Card size='sm' className='m-px'>
                  <CardContent className='flex aspect-square flex-col justify-between'>
                    <Badge variant='outline'>{product.category}</Badge>
                    <div>
                      <p className='text-sm font-medium'>{product.name}</p>
                      <p className='text-sm text-muted-foreground tabular-nums'>
                        {product.price}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious aria-label={t('devCommon.previous')} />
          <CarouselNext aria-label={t('devCommon.next')} />
        </Carousel>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.carousel.vertical')}
        description={t('devComponents.carousel.verticalDescription')}
        contentClassName='justify-center px-6 py-16'
      >
        <Carousel
          opts={{ align: 'start' }}
          orientation='vertical'
          className='w-full max-w-xs'
        >
          <CarouselContent className='-mt-1 h-56'>
            {announcements.map((item) => (
              <CarouselItem key={item.id} className='basis-1/2 pt-1'>
                <Card size='sm' className='m-px h-full'>
                  <CardHeader>
                    <CardDescription>{item.date}</CardDescription>
                    <CardTitle className='text-sm'>
                      {t(item.titleKey)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious aria-label={t('devCommon.previous')} />
          <CarouselNext aria-label={t('devCommon.next')} />
        </Carousel>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.carousel.api')}
        description={t('devComponents.carousel.apiDescription')}
        contentClassName='justify-center px-16'
      >
        <div className='w-full max-w-xs'>
          <Carousel setApi={setApi} opts={{ loop: true }} className='w-full'>
            <CarouselContent>
              {onboardingSteps.map((step) => (
                <CarouselItem key={step.id}>
                  <Card size='sm' className='m-px'>
                    <CardHeader>
                      <CardTitle>{t(step.titleKey)}</CardTitle>
                      <CardDescription>{t(step.bodyKey)}</CardDescription>
                    </CardHeader>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious aria-label={t('devCommon.previous')} />
            <CarouselNext aria-label={t('devCommon.next')} />
          </Carousel>
          <div className='flex items-center justify-between pt-3'>
            <p className='text-sm text-muted-foreground'>
              {t('devComponents.carousel.stepOf', {
                current,
                total: onboardingSteps.length,
              })}
            </p>
            <div className='flex items-center gap-1.5'>
              {onboardingSteps.map((step, index) => (
                <Button
                  key={step.id}
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t('devComponents.carousel.goToStep', {
                    step: index + 1,
                  })}
                  aria-current={current === index + 1 ? 'step' : undefined}
                  onClick={() => api?.scrollTo(index)}
                >
                  <span
                    aria-hidden='true'
                    className={cn(
                      'size-2 rounded-full bg-muted-foreground/40 transition-colors',
                      current === index + 1 && 'bg-primary',
                    )}
                  />
                </Button>
              ))}
            </div>
          </div>
        </div>
      </ExampleSection>
    </ExamplePage>
  );
}
