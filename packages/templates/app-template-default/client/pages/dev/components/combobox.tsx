import { useTranslation } from '@nocobase/i18n/client';
import { PackageIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { InputGroupAddon } from '@/components/ui/input-group';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item';

import { ExamplePage, ExampleSection } from '../shared';

const TEAM_MEMBERS: readonly string[] = [
  'Ava Chen',
  'Liam Patel',
  'Noah Fischer',
  'Mia Rossi',
  'Ethan Novak',
  'Sofia Alvarez',
];

interface Customer {
  readonly id: string;
  readonly name: string;
  readonly city: string;
}

const CUSTOMERS: readonly Customer[] = [
  { id: 'c-01', name: 'Northwind Traders', city: 'Seattle' },
  { id: 'c-02', name: 'Acme Corporation', city: 'Austin' },
  { id: 'c-03', name: 'Globex Industries', city: 'Berlin' },
  { id: 'c-04', name: 'Initech', city: 'Denver' },
  { id: 'c-05', name: 'Umbrella Logistics', city: 'Rotterdam' },
  { id: 'c-06', name: 'Stark Components', city: 'Singapore' },
];

interface ProductGroup {
  readonly value: string;
  readonly items: readonly string[];
}

const PRODUCT_GROUPS: readonly ProductGroup[] = [
  {
    value: 'Hardware',
    items: ['Barcode Scanner X2', 'Thermal Printer 80mm', 'POS Terminal Pro'],
  },
  {
    value: 'Software',
    items: ['Inventory Suite', 'Analytics Add-on', 'API Access'],
  },
  {
    value: 'Services',
    items: ['Onboarding Session', 'Priority Support', 'Data Migration'],
  },
];

const ORDER_TAGS: readonly string[] = [
  'Wholesale',
  'Priority',
  'Gift wrap',
  'Fragile',
  'Backorder',
  'International',
];

export default function ComboboxExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [assignee, setAssignee] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tags, setTags] = useState<string[]>(['Priority']);
  const [owner, setOwner] = useState<string | null>(null);
  const chipsAnchor = useComboboxAnchor();

  return (
    <ExamplePage
      title={t('devComponents.combobox.title')}
      description={t('devComponents.combobox.description')}
      source='client/pages/dev/components/combobox.tsx'
      docs='https://ui.shadcn.com/docs/components/combobox'
    >
      <ExampleSection
        title={t('devComponents.combobox.basic')}
        description={t('devComponents.combobox.basicDescription')}
        contentClassName='block'
      >
        <Field className='w-full max-w-xs'>
          <FieldLabel htmlFor='combobox-assignee'>
            {t('devComponents.combobox.assignee')}
          </FieldLabel>
          <Combobox
            items={TEAM_MEMBERS}
            value={assignee}
            onValueChange={(value: string | null) => setAssignee(value)}
          >
            <ComboboxInput
              id='combobox-assignee'
              placeholder={t('devComponents.combobox.assigneePlaceholder')}
            />
            <ComboboxContent>
              <ComboboxEmpty>{t('devComponents.combobox.empty')}</ComboboxEmpty>
              <ComboboxList>
                {(member: string) => (
                  <ComboboxItem key={member} value={member}>
                    {member}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>
            {assignee
              ? t('devComponents.combobox.assignedTo', { name: assignee })
              : t('devComponents.combobox.unassigned')}
          </FieldDescription>
        </Field>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.combobox.objectItems')}
        description={t('devComponents.combobox.objectItemsDescription')}
        contentClassName='block'
      >
        <Field className='w-full max-w-xs'>
          <FieldLabel htmlFor='combobox-customer'>
            {t('devCommon.customer')}
          </FieldLabel>
          <Combobox
            items={CUSTOMERS}
            itemToStringValue={(item: Customer) => item.name}
            value={customer}
            onValueChange={(value: Customer | null) => setCustomer(value)}
          >
            <ComboboxInput
              id='combobox-customer'
              placeholder={t('devComponents.combobox.customerPlaceholder')}
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>{t('devComponents.combobox.empty')}</ComboboxEmpty>
              <ComboboxList>
                {(item: Customer) => (
                  <ComboboxItem key={item.id} value={item}>
                    <Item size='xs' className='p-0'>
                      <ItemContent>
                        <ItemTitle className='whitespace-nowrap'>
                          {item.name}
                        </ItemTitle>
                        <ItemDescription>{item.city}</ItemDescription>
                      </ItemContent>
                    </Item>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>
            {customer
              ? t('devComponents.combobox.shipsTo', { city: customer.city })
              : t('devComponents.combobox.noCustomer')}
          </FieldDescription>
        </Field>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.combobox.groups')}
        description={t('devComponents.combobox.groupsDescription')}
      >
        <Combobox items={PRODUCT_GROUPS}>
          <ComboboxInput
            className='w-64'
            placeholder={t('devComponents.combobox.productPlaceholder')}
          >
            <InputGroupAddon>
              <PackageIcon />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent alignOffset={-28} className='w-64'>
            <ComboboxEmpty>{t('devComponents.combobox.empty')}</ComboboxEmpty>
            <ComboboxList>
              {(group: ProductGroup, index: number) => (
                <ComboboxGroup key={group.value} items={group.items}>
                  <ComboboxLabel>{group.value}</ComboboxLabel>
                  <ComboboxCollection>
                    {(product: string) => (
                      <ComboboxItem key={product} value={product}>
                        {product}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                  {index < PRODUCT_GROUPS.length - 1 ? (
                    <ComboboxSeparator />
                  ) : null}
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.combobox.multiple')}
        description={t('devComponents.combobox.multipleDescription')}
        contentClassName='block'
      >
        <Field className='w-full max-w-sm'>
          <FieldLabel>{t('devCommon.tags')}</FieldLabel>
          <Combobox
            multiple
            autoHighlight
            items={ORDER_TAGS}
            value={tags}
            onValueChange={(value: string[]) => setTags(value)}
          >
            <ComboboxChips ref={chipsAnchor}>
              <ComboboxValue>
                {tags.map((tag) => (
                  <ComboboxChip key={tag}>{tag}</ComboboxChip>
                ))}
              </ComboboxValue>
              <ComboboxChipsInput
                placeholder={t('devComponents.combobox.addTag')}
              />
            </ComboboxChips>
            <ComboboxContent anchor={chipsAnchor}>
              <ComboboxEmpty>{t('devComponents.combobox.empty')}</ComboboxEmpty>
              <ComboboxList>
                {(tag: string) => (
                  <ComboboxItem key={tag} value={tag}>
                    {tag}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>
            {t('devComponents.combobox.tagCount', { count: tags.length })}
          </FieldDescription>
        </Field>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.combobox.popup')}
        description={t('devComponents.combobox.popupDescription')}
      >
        <Combobox
          items={TEAM_MEMBERS}
          value={owner}
          onValueChange={(value: string | null) => setOwner(value)}
        >
          <ComboboxTrigger
            render={
              <Button
                variant='outline'
                className='w-64 justify-between font-normal'
              />
            }
          >
            <ComboboxValue
              placeholder={
                <span className='text-muted-foreground'>
                  {t('devComponents.combobox.ownerPlaceholder')}
                </span>
              }
            />
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput
              showTrigger={false}
              placeholder={t('devCommon.search')}
            />
            <ComboboxEmpty>{t('devComponents.combobox.empty')}</ComboboxEmpty>
            <ComboboxList>
              {(member: string) => (
                <ComboboxItem key={member} value={member}>
                  {member}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.combobox.states')}
        description={t('devComponents.combobox.statesDescription')}
        contentClassName='grid gap-4 sm:grid-cols-2'
      >
        <Field>
          <FieldLabel htmlFor='combobox-disabled'>
            {t('devComponents.combobox.disabled')}
          </FieldLabel>
          <Combobox items={TEAM_MEMBERS} defaultValue={TEAM_MEMBERS[0]}>
            <ComboboxInput id='combobox-disabled' disabled />
            <ComboboxContent>
              <ComboboxList>
                {(member: string) => (
                  <ComboboxItem key={member} value={member}>
                    {member}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor='combobox-invalid'>
            {t('devComponents.combobox.invalid')}
          </FieldLabel>
          <Combobox items={TEAM_MEMBERS}>
            <ComboboxInput
              id='combobox-invalid'
              aria-invalid='true'
              placeholder={t('devComponents.combobox.assigneePlaceholder')}
            />
            <ComboboxContent>
              <ComboboxEmpty>{t('devComponents.combobox.empty')}</ComboboxEmpty>
              <ComboboxList>
                {(member: string) => (
                  <ComboboxItem key={member} value={member}>
                    {member}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldError>{t('devComponents.combobox.requiredError')}</FieldError>
        </Field>
      </ExampleSection>
    </ExamplePage>
  );
}
