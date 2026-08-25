import type { UseFormReturn } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteSelect } from '@/extensions/nocobase-client';
import {
  asRecord,
  loadRelationOptions,
  toScalarString,
  type RelationOption,
} from './data';
import type { CrmFieldConfig, CrmResourceConfig } from './resource-config';

export type CrmFormValues = Record<string, unknown>;

const toInputValue = (value: unknown, kind: CrmFieldConfig['kind']) => {
  if (value === null || value === undefined) return '';
  const scalarValue = toScalarString(value);
  if (kind !== 'date' && kind !== 'datetime') return scalarValue;
  const date = new Date(scalarValue);
  if (Number.isNaN(date.getTime())) return scalarValue;
  if (kind === 'date') return date.toISOString().slice(0, 10);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function RelationField({
  form,
  fieldConfig,
  initialRecord,
}: {
  form: UseFormReturn<CrmFormValues>;
  fieldConfig: CrmFieldConfig;
  initialRecord?: Record<string, unknown>;
}) {
  const relation = fieldConfig.relation!;
  const initialOption = asRecord(initialRecord?.[relation.relationName]) as
    RelationOption | undefined;
  const [selected, setSelected] = useState<RelationOption | null>(
    initialOption ?? null,
  );

  useEffect(() => setSelected(initialOption ?? null), [initialOption]);

  return (
    <FormField
      control={form.control}
      name={fieldConfig.name}
      rules={{
        required: fieldConfig.required
          ? `${fieldConfig.label}不能为空`
          : undefined,
      }}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{fieldConfig.label}</FormLabel>
          <FormControl
            render={
              <RemoteSelect<RelationOption>
                value={selected}
                onValueChange={(option) => {
                  setSelected(option);
                  field.onChange(option?.id ?? null);
                }}
                requestKey={[relation.resource, relation.labelField]}
                loadOptions={(params) =>
                  loadRelationOptions({
                    ...params,
                    resource: relation.resource,
                    labelField: relation.labelField,
                  })
                }
                getOptionKey={(option) => option.id}
                getOptionLabel={(option) =>
                  toScalarString(
                    option[relation.labelField],
                    toScalarString(option.id),
                  )
                }
                renderOption={(option) => (
                  <div className='min-w-0'>
                    <p className='truncate'>
                      {toScalarString(
                        option[relation.labelField],
                        toScalarString(option.id),
                      )}
                    </p>
                    {relation.secondaryField &&
                    option[relation.secondaryField] ? (
                      <p className='truncate text-xs text-muted-foreground'>
                        {toScalarString(option[relation.secondaryField])}
                      </p>
                    ) : null}
                  </div>
                )}
                placeholder={`选择${fieldConfig.label}`}
                messages={{
                  searchPlaceholder: `搜索${fieldConfig.label}`,
                  empty: '没有匹配记录',
                  loading: '正在加载...',
                  loadMore: '加载更多',
                  loadingMore: '正在加载...',
                  error: '选项加载失败',
                  retry: '重试',
                }}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ScalarField({
  form,
  fieldConfig,
}: {
  form: UseFormReturn<CrmFormValues>;
  fieldConfig: CrmFieldConfig;
}) {
  const rules = useMemo(
    () => ({
      required: fieldConfig.required
        ? `${fieldConfig.label}不能为空`
        : undefined,
      ...(fieldConfig.kind === 'email'
        ? {
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: '请输入有效的邮箱地址',
            },
          }
        : {}),
    }),
    [fieldConfig],
  );

  return (
    <FormField
      control={form.control}
      name={fieldConfig.name}
      rules={rules}
      render={({ field }) => (
        <FormItem
          className={
            fieldConfig.kind === 'textarea' ? 'sm:col-span-2' : undefined
          }
        >
          <FormLabel>{fieldConfig.label}</FormLabel>
          {fieldConfig.kind === 'select' ? (
            <Select
              value={field.value ? toScalarString(field.value) : null}
              onValueChange={field.onChange}
            >
              <FormControl
                render={
                  <SelectTrigger className='h-10 w-full'>
                    <SelectValue placeholder={`选择${fieldConfig.label}`} />
                  </SelectTrigger>
                }
              />
              <SelectContent align='start'>
                {fieldConfig.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : fieldConfig.kind === 'textarea' ? (
            <FormControl
              render={
                <Textarea
                  {...field}
                  value={toScalarString(field.value)}
                  placeholder={
                    fieldConfig.placeholder ?? `填写${fieldConfig.label}`
                  }
                  className='min-h-28 resize-y'
                />
              }
            />
          ) : (
            <FormControl
              render={
                <Input
                  {...field}
                  value={toInputValue(field.value, fieldConfig.kind)}
                  type={
                    fieldConfig.kind === 'email'
                      ? 'email'
                      : fieldConfig.kind === 'phone'
                        ? 'tel'
                        : fieldConfig.kind === 'url'
                          ? 'url'
                          : fieldConfig.kind === 'number' ||
                              fieldConfig.kind === 'percent'
                            ? 'number'
                            : fieldConfig.kind === 'date'
                              ? 'date'
                              : fieldConfig.kind === 'datetime'
                                ? 'datetime-local'
                                : 'text'
                  }
                  min={fieldConfig.kind === 'percent' ? 0 : undefined}
                  max={fieldConfig.kind === 'percent' ? 100 : undefined}
                  step={fieldConfig.kind === 'number' ? '0.01' : undefined}
                  placeholder={
                    fieldConfig.placeholder ?? `填写${fieldConfig.label}`
                  }
                />
              }
            />
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CrmRecordFormFields({
  form,
  config,
  initialRecord,
}: {
  form: UseFormReturn<CrmFormValues>;
  config: CrmResourceConfig;
  initialRecord?: Record<string, unknown>;
}) {
  return (
    <div className='grid gap-5 sm:grid-cols-2'>
      {config.fields
        .filter((fieldConfig) => fieldConfig.form !== false)
        .map((fieldConfig) =>
          fieldConfig.kind === 'relation' ? (
            <RelationField
              key={fieldConfig.name}
              form={form}
              fieldConfig={fieldConfig}
              initialRecord={initialRecord}
            />
          ) : (
            <ScalarField
              key={fieldConfig.name}
              form={form}
              fieldConfig={fieldConfig}
            />
          ),
        )}
    </div>
  );
}
