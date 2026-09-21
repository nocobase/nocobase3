import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

import { ExamplePage, ExampleSection } from '../shared';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Base UI reports a single thumb as a number and several thumbs as an array. */
function toValues(value: number | readonly number[]): number[] {
  return typeof value === 'number' ? [value] : [...value];
}

export default function SliderExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [budget, setBudget] = useState<number[]>([2500]);
  const [priceRange, setPriceRange] = useState<number[]>([200, 800]);

  return (
    <ExamplePage
      title={t('devComponents.slider.title')}
      description={t('devComponents.slider.description')}
      source='client/pages/dev/components/slider.tsx'
      docs='https://ui.shadcn.com/docs/components/slider'
    >
      <ExampleSection
        title={t('devComponents.slider.basic')}
        description={t('devComponents.slider.basicDescription')}
        contentClassName='block'
      >
        <div className='grid w-full max-w-xs gap-3'>
          <Label htmlFor='slider-discount'>
            {t('devComponents.slider.discount')}
          </Label>
          <Slider id='slider-discount' defaultValue={[15]} max={50} step={5} />
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.slider.controlled')}
        description={t('devComponents.slider.controlledDescription')}
        contentClassName='block'
      >
        <div className='grid w-full max-w-xs gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <Label htmlFor='slider-budget'>
              {t('devComponents.slider.monthlyBudget')}
            </Label>
            <span className='text-sm text-muted-foreground tabular-nums'>
              {currency.format(budget[0])}
            </span>
          </div>
          <Slider
            id='slider-budget'
            value={budget}
            onValueChange={(value) => setBudget(toValues(value))}
            min={0}
            max={10000}
            step={100}
          />
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.slider.range')}
        description={t('devComponents.slider.rangeDescription')}
        contentClassName='block'
      >
        <div className='grid w-full max-w-xs gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <Label htmlFor='slider-price-range'>
              {t('devComponents.slider.priceRange')}
            </Label>
            <span className='text-sm text-muted-foreground tabular-nums'>
              {currency.format(priceRange[0])} –{' '}
              {currency.format(priceRange[1])}
            </span>
          </div>
          <Slider
            id='slider-price-range'
            value={priceRange}
            onValueChange={(value) => setPriceRange(toValues(value))}
            min={0}
            max={1000}
            step={50}
            minStepsBetweenValues={1}
          />
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.slider.vertical')}
        description={t('devComponents.slider.verticalDescription')}
      >
        <div className='flex items-end gap-10'>
          <div className='flex flex-col items-center gap-3'>
            <Slider
              defaultValue={[20]}
              max={100}
              step={5}
              orientation='vertical'
              className='h-40'
            />
            <span className='text-xs text-muted-foreground'>
              {t('devComponents.slider.lowStockAlert')}
            </span>
          </div>
          <div className='flex flex-col items-center gap-3'>
            <Slider
              defaultValue={[60]}
              max={100}
              step={5}
              orientation='vertical'
              className='h-40'
            />
            <span className='text-xs text-muted-foreground'>
              {t('devComponents.slider.reorderLevel')}
            </span>
          </div>
        </div>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.slider.disabled')}
        description={t('devComponents.slider.disabledDescription')}
        contentClassName='block'
      >
        <div className='grid w-full max-w-xs gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <Label htmlFor='slider-locked'>
              {t('devComponents.slider.approvedDiscount')}
            </Label>
            <span className='text-sm text-muted-foreground tabular-nums'>
              25%
            </span>
          </div>
          <Slider id='slider-locked' defaultValue={[25]} max={50} disabled />
        </div>
      </ExampleSection>
    </ExamplePage>
  );
}
