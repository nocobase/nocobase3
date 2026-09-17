import { useTranslation as useDemoTranslation } from '@nocobase/i18n/client';
import { PageHeader } from '../../components/page-header.js';
import {
  AIChatWindow,
  AIEmployeeShortcut,
  ChatInline,
  useAIForm,
  useAIPageElement,
  useAIPageElementHandle,
} from '../../../registry/nocobase-ai/components/index.js';
import { applyReactHookFormValues } from '../../../registry/nocobase-ai/adapters/react-hook-form.js';
import { Badge } from '../../../registry/nocobase-ai/shared/ui/badge.js';
import { Button } from '../../../registry/nocobase-ai/shared/ui/button.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../registry/nocobase-ai/shared/ui/card.js';
import { Input } from '../../../registry/nocobase-ai/shared/ui/input.js';
import { Label } from '../../../registry/nocobase-ai/shared/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../registry/nocobase-ai/shared/ui/select.js';
import { Textarea } from '../../../registry/nocobase-ai/shared/ui/textarea.js';
import {
  AIChatProvider,
  AIPageContextScope,
  useAI,
  useAIChatController,
  type AIEmployeeTask,
  type AIEmployeeTasks,
  type AIWorkContextItem,
} from '../../../registry/nocobase-ai/providers/index.js';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { AIConfigurationGate } from './configuration-gate.js';
import { PageContextPromptGenerator } from './page-context-prompt-generator.js';
import { PageElementShowcase } from './page-element-showcase.js';
import { useAITranslate } from '../../../registry/nocobase-ai/locales/use-ai-translate.js';

const isBusinessEmployee = (employee: { username: string }) =>
  !['nathan', 'dara'].includes(employee.username.toLowerCase());

export function PageContextPage() {
  return (
    <AIConfigurationGate>
      <PageContextPageContent />
    </AIConfigurationGate>
  );
}

function PageContextPageContent() {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-ai-employee',
  );

  const t = useAITranslate();
  return (
    <div className='space-y-6'>
      <PageHeader
        title={t('demo.context.title', 'Page context and frontend tools')}
        description={t(
          'demo.context.description',
          'Connect AI employees to live React page state. Start with manual context selection, configure task context, then expose fixed or custom frontend capabilities that can safely update the page.',
        )}
      />

      <ContextSection
        eyebrow='Manual context'
        title={translateDemo('Pick page context while composing a message', {
          defaultValue: 'Pick page context while composing a message',
        })}
        description={translateDemo(
          'The user can pick any registered page element from the composer. Its current content is added to this message without changing task configuration.',
          {
            defaultValue:
              'The user can pick any registered page element from the composer. Its current content is added to this message without changing task configuration.',
          },
        )}
      >
        <PageElementShowcase />
      </ContextSection>

      <ContextSection
        eyebrow='Task context · Shortcut'
        title={translateDemo('Reference page context from a Shortcut task', {
          defaultValue: 'Reference page context from a Shortcut task',
        })}
        description={translateDemo(
          'The Shortcut task stores a page-element reference in message.workContext and reads its latest content when the user starts the task.',
          {
            defaultValue:
              'The Shortcut task stores a page-element reference in message.workContext and reads its latest content when the user starts the task.',
          },
        )}
      >
        <ShortcutTaskContextShowcase />
      </ContextSection>

      <ContextSection
        eyebrow='Task context · Conversation preset'
        title={translateDemo(
          'Reference page context from a conversation preset task',
          {
            defaultValue:
              'Reference page context from a conversation preset task',
          },
        )}
        description={translateDemo(
          'The AIChatProvider employeeTasks configuration uses the same message.workContext reference, but exposes the task in the conversation empty state instead of through a Shortcut.',
          {
            defaultValue:
              'The AIChatProvider employeeTasks configuration uses the same message.workContext reference, but exposes the task in the conversation empty state instead of through a Shortcut.',
          },
        )}
      >
        <PresetTaskContextShowcase />
      </ContextSection>

      <ContextSection
        eyebrow='Task context · Scope inheritance'
        title={translateDemo('Inherit the surrounding page context', {
          defaultValue: 'Inherit the surrounding page context',
        })}
        description={translateDemo(
          'A Shortcut or AIChatProvider inside AIPageContextScope inherits that context. A task-level message.workContext still takes precedence when configured.',
          {
            defaultValue:
              'A Shortcut or AIChatProvider inside AIPageContextScope inherits that context. A task-level message.workContext still takes precedence when configured.',
          },
        )}
      >
        <InheritedContextShowcase />
      </ContextSection>

      <ContextSection
        eyebrow='Built-in frontend tool'
        title={translateDemo('Fill a registered React form with Form filler', {
          defaultValue: 'Fill a registered React form with Form filler',
        })}
        description={translateDemo(
          'Form filler is registered once by AIProvider. The form exposes its identifier, field schema, live values, and setter through useAIForm; it is not part of the custom frontend Tool catalog.',
          {
            defaultValue:
              'Form filler is registered once by AIProvider. The form exposes its identifier, field schema, live values, and setter through useAIForm; it is not part of the custom frontend Tool catalog.',
          },
        )}
      >
        <FormFillerShowcase />
      </ContextSection>

      <ContextSection
        eyebrow='Custom frontend tool'
        title={translateDemo(
          'Expose a page-specific action to the AI employee',
          { defaultValue: 'Expose a page-specific action to the AI employee' },
        )}
        description={translateDemo(
          'A registered page element can advertise custom Tools through the NocoBase loadFrontendTool and executeFrontendTool protocol. The example uses ASK permission and updates only the local quote preview.',
          {
            defaultValue:
              'A registered page element can advertise custom Tools through the NocoBase loadFrontendTool and executeFrontendTool protocol. The example uses ASK permission and updates only the local quote preview.',
          },
        )}
      >
        <CustomFrontendToolShowcase />
      </ContextSection>

      <ContextSection
        eyebrow='Prompt generator'
        title={translateDemo('Generate a complete page context scene', {
          defaultValue: 'Generate a complete page context scene',
        })}
        description={translateDemo(
          'Describe the business scene, select the AI employee and task, then generate the full page surface, context binding, conversation layout, and optional frontend capability together.',
          {
            defaultValue:
              'Describe the business scene, select the AI employee and task, then generate the full page surface, context binding, conversation layout, and optional frontend capability together.',
          },
        )}
      >
        <PageContextPromptGenerator />
      </ContextSection>
    </div>
  );
}

type LeadIntakeValues = {
  company: string;
  contactName: string;
  email: string;
  priority: 'low' | 'normal' | 'high';
};

function FormFillerShowcase() {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-ai-employee',
  );

  const { employees } = useAI();
  const employee =
    employees.find((item) => item.username.toLowerCase() === 'dex') ??
    employees.filter(isBusinessEmployee)[0]!;
  const controller = useAIChatController();
  const [sourceText, setSourceText] = useState(
    'Acme Logistics is evaluating the enterprise plan. The main contact is Jordan Lee at jordan.lee@acme.test. This is a high-priority opportunity.',
  );
  const form = useForm<LeadIntakeValues>({
    defaultValues: {
      company: '',
      contactName: '',
      email: '',
      priority: 'normal',
    },
  });
  const fields = useMemo(
    () => [
      {
        name: 'company',
        title: translateDemo('Company', { defaultValue: 'Company' }),
        type: 'string',
        required: true,
      },
      {
        name: 'contactName',
        title: translateDemo('Contact name', { defaultValue: 'Contact name' }),
        type: 'string',
        required: true,
      },
      {
        name: 'email',
        title: translateDemo('Email', { defaultValue: 'Email' }),
        type: 'email',
      },
      {
        name: 'priority',
        title: translateDemo('Priority', { defaultValue: 'Priority' }),
        type: 'string',
        enum: ['low', 'normal', 'high'],
      },
    ],
    [translateDemo],
  );
  const formRef = useAIForm({
    id: 'lead-intake-form',
    title: translateDemo('Lead intake form', {
      defaultValue: 'Lead intake form',
    }),
    fields,
    getValues: form.getValues,
    setValues: (values) => applyReactHookFormValues(form, values),
  });
  const contextReference = useMemo<AIWorkContextItem>(
    () => ({
      type: 'page-element',
      id: 'lead-intake-form',
      title: translateDemo('Lead intake form', {
        defaultValue: 'Lead intake form',
      }),
      kind: 'form',
    }),
    [translateDemo],
  );
  const task = useMemo<AIEmployeeTask>(
    () => ({
      title: translateDemo('Fill lead form', {
        defaultValue: 'Fill lead form',
      }),
      message: {
        user: `Extract the lead details from the following text and fill the current form. Do not submit it.\n\n${sourceText}`,
      },
      autoSend: true,
    }),
    [translateDemo, sourceText],
  );

  return (
    <AIPageContextScope context={contextReference}>
      <AIChatProvider
        id='form-filler-context-demo'
        controller={controller}
        defaultEmployee={employee.username}
      >
        <Card className='gap-0 overflow-hidden py-0'>
          <div className='grid min-h-[610px] xl:grid-cols-[minmax(0,1fr)_410px]'>
            <div className='space-y-5 bg-muted/15 p-4 sm:p-5'>
              <Card>
                <CardHeader>
                  <div className='flex items-start justify-between gap-4'>
                    <div>
                      <CardTitle>
                        {translateDemo('Source content', {
                          defaultValue: 'Source content',
                        })}
                      </CardTitle>
                      <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                        {translateDemo(
                          'Edit this text, then ask the AI employee to fill the registered form below.',
                          {
                            defaultValue:
                              'Edit this text, then ask the AI employee to fill the registered form below.',
                          },
                        )}
                      </p>
                    </div>
                    <AIEmployeeShortcut
                      aiEmployee={employee.username}
                      target={controller}
                      tasks={[task]}
                      label={`Ask ${employee.nickname}`}
                      size={34}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    className='min-h-28'
                  />
                </CardContent>
              </Card>

              <form ref={formRef} className='rounded-xl border bg-card'>
                <div className='flex flex-wrap items-start justify-between gap-3 border-b p-5'>
                  <div>
                    <h3 className='font-semibold'>
                      {translateDemo('Lead intake form', {
                        defaultValue: 'Lead intake form',
                      })}
                    </h3>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {translateDemo(
                        'Form filler changes visible values only. It never submits the form.',
                        {
                          defaultValue:
                            'Form filler changes visible values only. It never submits the form.',
                        },
                      )}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Badge variant='secondary'>useAIForm</Badge>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        form.reset({
                          company: '',
                          contactName: '',
                          email: '',
                          priority: 'normal',
                        })
                      }
                    >
                      {translateDemo('Clear', { defaultValue: 'Clear' })}
                    </Button>
                  </div>
                </div>
                <div className='grid gap-4 p-5 sm:grid-cols-2'>
                  <label className='space-y-2'>
                    <Label htmlFor='form-filler-company'>
                      {translateDemo('Company', { defaultValue: 'Company' })}
                    </Label>
                    <Input
                      id='form-filler-company'
                      {...form.register('company')}
                    />
                  </label>
                  <label className='space-y-2'>
                    <Label htmlFor='form-filler-contact'>
                      {translateDemo('Contact name', {
                        defaultValue: 'Contact name',
                      })}
                    </Label>
                    <Input
                      id='form-filler-contact'
                      {...form.register('contactName')}
                    />
                  </label>
                  <label className='space-y-2'>
                    <Label htmlFor='form-filler-email'>
                      {translateDemo('Email', { defaultValue: 'Email' })}
                    </Label>
                    <Input
                      id='form-filler-email'
                      type='email'
                      {...form.register('email')}
                    />
                  </label>
                  <label className='space-y-2'>
                    <Label>
                      {translateDemo('Priority', { defaultValue: 'Priority' })}
                    </Label>
                    <Select
                      value={form.watch('priority')}
                      onValueChange={(value) =>
                        value &&
                        form.setValue(
                          'priority',
                          value as LeadIntakeValues['priority'],
                          {
                            shouldDirty: true,
                            shouldTouch: true,
                          },
                        )
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='low'>
                          {translateDemo('Low', { defaultValue: 'Low' })}
                        </SelectItem>
                        <SelectItem value='normal'>
                          {translateDemo('Normal', { defaultValue: 'Normal' })}
                        </SelectItem>
                        <SelectItem value='high'>
                          {translateDemo('High', { defaultValue: 'High' })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </form>
            </div>

            <div className='min-h-0 border-t bg-card xl:border-l xl:border-t-0'>
              <ChatInline className='h-[610px] rounded-none border-0'>
                <AIChatWindow
                  showConversationToggle={false}
                  disclaimer={false}
                />
              </ChatInline>
            </div>
          </div>
        </Card>
      </AIChatProvider>
    </AIPageContextScope>
  );
}

function CustomFrontendToolShowcase() {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-ai-employee',
  );

  const { employees } = useAI();
  const employee = employees.filter(isBusinessEmployee)[0]!;
  const controller = useAIChatController();
  const [discountPercent, setDiscountPercent] = useState(0);
  const [approvalNote, setApprovalNote] = useState('Not reviewed');
  const baseAmount = 24_000;
  const total = baseAmount * (1 - discountPercent / 100);
  const tools = useMemo(
    () => [
      {
        name: 'update_quote_discount',
        title: translateDemo('Update quote discount', {
          defaultValue: 'Update quote discount',
        }),
        description:
          'Update the discount percentage and review note shown on the current quote. This changes the page preview only and does not save the quote.',
        permission: 'ASK' as const,
        inputSchema: {
          type: 'object',
          properties: {
            discountPercent: {
              type: 'number',
              minimum: 0,
              maximum: 30,
              description: 'Discount percentage applied to the quote.',
            },
            note: {
              type: 'string',
              description: 'Short explanation shown in the review note.',
            },
          },
          required: ['discountPercent', 'note'],
          additionalProperties: false,
        },
        execute: (args: unknown) => {
          const values =
            args && typeof args === 'object' && !Array.isArray(args)
              ? (args as { discountPercent?: unknown; note?: unknown })
              : {};
          if (
            typeof values.discountPercent !== 'number' ||
            values.discountPercent < 0 ||
            values.discountPercent > 30 ||
            typeof values.note !== 'string'
          ) {
            return {
              status: 'error',
              content: 'Provide a discount from 0 to 30 and a review note.',
            };
          }
          setDiscountPercent(values.discountPercent);
          setApprovalNote(values.note);
          return {
            status: 'success',
            content: `Updated the quote preview to a ${values.discountPercent}% discount.`,
          };
        },
      },
    ],
    [translateDemo],
  );
  const quoteContext = useAIPageElementHandle({
    id: 'quote-review-card',
    title: translateDemo('Quote review', { defaultValue: 'Quote review' }),
    kind: 'record-detail',
    tools,
    getContext: () => ({
      resource: 'quotes',
      record: {
        quoteNumber: 'QT-2026-1048',
        customer: 'Northwind Studio',
        baseAmount,
        discountPercent,
        total,
        approvalNote,
      },
    }),
  });
  const task = useMemo<AIEmployeeTask>(
    () => ({
      title: translateDemo('Apply review discount', {
        defaultValue: 'Apply review discount',
      }),
      message: {
        user: "Update the current quote preview to use a 12% discount and set the review note to 'Approved for the renewal discussion'.",
      },
      autoSend: true,
    }),
    [translateDemo],
  );

  return (
    <AIPageContextScope context={quoteContext.context}>
      <AIChatProvider
        id='custom-frontend-tool-demo'
        controller={controller}
        defaultEmployee={employee.username}
      >
        <Card className='gap-0 overflow-hidden py-0'>
          <div className='grid min-h-[560px] xl:grid-cols-[minmax(0,1fr)_410px]'>
            <div className='bg-muted/15 p-4 sm:p-5'>
              <Card ref={quoteContext.ref}>
                <CardHeader>
                  <div className='flex flex-wrap items-start justify-between gap-4'>
                    <div>
                      <CardTitle>
                        {translateDemo('Quote review', {
                          defaultValue: 'Quote review',
                        })}
                      </CardTitle>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        QT-2026-1048 · Northwind Studio
                      </p>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Badge variant='outline'>
                        {translateDemo('Custom Tool', {
                          defaultValue: 'Custom Tool',
                        })}
                      </Badge>
                      <Badge variant='secondary'>ASK</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='space-y-5'>
                  <div className='grid gap-3 sm:grid-cols-3'>
                    {[
                      ['Base amount', `$${baseAmount.toLocaleString()}`],
                      ['Discount', `${discountPercent}%`],
                      ['Preview total', `$${total.toLocaleString()}`],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className='rounded-lg border bg-background p-3'
                      >
                        <div className='text-xs text-muted-foreground'>
                          {label}
                        </div>
                        <div className='mt-1 font-medium'>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className='rounded-lg border bg-background p-3'>
                    <div className='text-xs text-muted-foreground'>
                      {translateDemo('Review note', {
                        defaultValue: 'Review note',
                      })}
                    </div>
                    <div className='mt-1 text-sm'>{approvalNote}</div>
                  </div>
                  <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
                    <p className='max-w-lg text-xs leading-5 text-muted-foreground'>
                      {translateDemo(
                        'The page element registers update_quote_discount. Its full input schema is loaded only when the AI chooses this Tool. Approval is controlled by the ASK permission.',
                        {
                          defaultValue:
                            'The page element registers update_quote_discount. Its full input schema is loaded only when the AI chooses this Tool. Approval is controlled by the ASK permission.',
                        },
                      )}
                    </p>
                    <AIEmployeeShortcut
                      aiEmployee={employee.username}
                      target={controller}
                      tasks={[task]}
                      label={`Ask ${employee.nickname}`}
                      size={34}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className='min-h-0 border-t bg-card xl:border-l xl:border-t-0'>
              <ChatInline className='h-[560px] rounded-none border-0'>
                <AIChatWindow
                  showConversationToggle={false}
                  disclaimer={false}
                />
              </ChatInline>
            </div>
          </div>
        </Card>
      </AIChatProvider>
    </AIPageContextScope>
  );
}

function ShortcutTaskContextShowcase() {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-ai-employee',
  );

  const { employees } = useAI();
  const employee = employees.filter(isBusinessEmployee)[0]!;
  const controller = useAIChatController();
  const [summary, setSummary] = useState(
    'Payment callback reached the order service twelve minutes late.',
  );
  const [severity, setSeverity] = useState('high');
  const contextReference = useMemo<AIWorkContextItem>(
    () => ({
      type: 'page-element',
      id: 'selected-support-case',
      title: translateDemo('Selected support case', {
        defaultValue: 'Selected support case',
      }),
    }),
    [translateDemo],
  );
  const contextRef = useAIPageElement({
    id: 'selected-support-case',
    title: translateDemo('Selected support case', {
      defaultValue: 'Selected support case',
    }),
    kind: 'editable-record',
    getContext: () => ({
      resource: 'supportTickets',
      values: { summary, severity },
    }),
  });

  const shortcutTask = useMemo<AIEmployeeTask>(
    () => ({
      title: translateDemo('Analyze selected case', {
        defaultValue: 'Analyze selected case',
      }),
      message: {
        user: 'Analyze the selected support case.',
        workContext: [contextReference],
      },
      autoSend: false,
    }),
    [translateDemo, contextReference],
  );
  return (
    <AIChatProvider
      id='shortcut-task-context-demo'
      controller={controller}
      defaultEmployee={employee.username}
    >
      <Card className='gap-0 overflow-hidden py-0'>
        <div className='grid min-h-[560px] xl:grid-cols-[minmax(0,1fr)_410px]'>
          <div className='bg-muted/15 p-4 sm:p-5'>
            <Card ref={contextRef}>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>
                      {translateDemo('Selected support case', {
                        defaultValue: 'Selected support case',
                      })}
                    </CardTitle>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {translateDemo(
                        'Change a value before running either task.',
                        {
                          defaultValue:
                            'Change a value before running either task.',
                        },
                      )}
                    </p>
                  </div>
                  <Badge variant='secondary'>
                    {translateDemo('Task context', {
                      defaultValue: 'Task context',
                    })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <label className='block space-y-2'>
                  <Label htmlFor='selected-context-summary'>
                    {translateDemo('Summary', { defaultValue: 'Summary' })}
                  </Label>
                  <Input
                    id='selected-context-summary'
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                  />
                </label>
                <label className='block space-y-2'>
                  <Label>
                    {translateDemo('Severity', { defaultValue: 'Severity' })}
                  </Label>
                  <Select
                    value={severity}
                    onValueChange={(value) => value && setSeverity(value)}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='low'>
                        {translateDemo('Low', { defaultValue: 'Low' })}
                      </SelectItem>
                      <SelectItem value='medium'>
                        {translateDemo('Medium', { defaultValue: 'Medium' })}
                      </SelectItem>
                      <SelectItem value='high'>
                        {translateDemo('High', { defaultValue: 'High' })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </CardContent>
            </Card>
            <Card className='mt-5 border-dashed bg-background/80'>
              <CardHeader>
                <div className='flex items-start justify-between gap-4'>
                  <div>
                    <CardTitle>
                      {translateDemo('Task shortcut area', {
                        defaultValue: 'Task shortcut area',
                      })}
                    </CardTitle>
                    <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                      {translateDemo(
                        'This button is outside the selected page element. Its task explicitly references “Selected support case”.',
                        {
                          defaultValue:
                            'This button is outside the selected page element. Its task explicitly references “Selected support case”.',
                        },
                      )}
                    </p>
                  </div>
                  <Badge variant='outline'>
                    {translateDemo('Explicit reference', {
                      defaultValue: 'Explicit reference',
                    })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <AIEmployeeShortcut
                  aiEmployee={employee.username}
                  target={controller}
                  tasks={[shortcutTask]}
                  label={translateDemo('Analyze selected case', {
                    defaultValue: 'Analyze selected case',
                  })}
                  size={34}
                />
              </CardContent>
            </Card>
          </div>

          <div className='min-h-0 border-t bg-card xl:border-l xl:border-t-0'>
            <ChatInline className='h-[560px] rounded-none border-0'>
              <AIChatWindow showConversationToggle={false} disclaimer={false} />
            </ChatInline>
          </div>
        </div>
      </Card>
    </AIChatProvider>
  );
}

function PresetTaskContextShowcase() {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-ai-employee',
  );

  const { employees } = useAI();
  const employee = employees.filter(isBusinessEmployee)[0]!;
  const [opportunityName, setOpportunityName] = useState(
    'Enterprise workspace expansion',
  );
  const [forecast, setForecast] = useState('likely');
  const contextReference = useMemo<AIWorkContextItem>(
    () => ({
      type: 'page-element',
      id: 'selected-opportunity',
      title: translateDemo('Selected opportunity', {
        defaultValue: 'Selected opportunity',
      }),
    }),
    [translateDemo],
  );
  const contextRef = useAIPageElement({
    id: 'selected-opportunity',
    title: translateDemo('Selected opportunity', {
      defaultValue: 'Selected opportunity',
    }),
    kind: 'record-detail',
    getContext: () => ({
      resource: 'opportunities',
      record: { name: opportunityName, forecast },
    }),
  });
  const presetTask = useMemo<AIEmployeeTask>(
    () => ({
      title: translateDemo('Prepare opportunity brief', {
        defaultValue: 'Prepare opportunity brief',
      }),
      message: {
        user: 'Prepare a brief for the selected opportunity.',
        workContext: [contextReference],
      },
      autoSend: false,
    }),
    [translateDemo, contextReference],
  );
  const employeeTasks = useMemo<AIEmployeeTasks>(
    () => ({ [employee.username]: [presetTask] }),
    [employee.username, presetTask],
  );

  return (
    <AIChatProvider
      id='preset-task-context-demo'
      defaultEmployee={employee.username}
      employeeTasks={employeeTasks}
    >
      <Card className='gap-0 overflow-hidden py-0'>
        <div className='grid min-h-[560px] xl:grid-cols-[minmax(0,1fr)_410px]'>
          <div className='bg-muted/15 p-4 sm:p-5'>
            <Card ref={contextRef}>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>
                      {translateDemo('Selected opportunity', {
                        defaultValue: 'Selected opportunity',
                      })}
                    </CardTitle>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {translateDemo(
                        'Change a value, then select the preset task in the chat.',
                        {
                          defaultValue:
                            'Change a value, then select the preset task in the chat.',
                        },
                      )}
                    </p>
                  </div>
                  <Badge variant='secondary'>
                    {translateDemo('Preset task context', {
                      defaultValue: 'Preset task context',
                    })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <label className='block space-y-2'>
                  <Label htmlFor='preset-context-opportunity'>
                    {translateDemo('Opportunity', {
                      defaultValue: 'Opportunity',
                    })}
                  </Label>
                  <Input
                    id='preset-context-opportunity'
                    value={opportunityName}
                    onChange={(event) => setOpportunityName(event.target.value)}
                  />
                </label>
                <label className='block space-y-2'>
                  <Label>
                    {translateDemo('Forecast', { defaultValue: 'Forecast' })}
                  </Label>
                  <Select
                    value={forecast}
                    onValueChange={(value) => value && setForecast(value)}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='pipeline'>
                        {translateDemo('Pipeline', {
                          defaultValue: 'Pipeline',
                        })}
                      </SelectItem>
                      <SelectItem value='likely'>
                        {translateDemo('Likely', { defaultValue: 'Likely' })}
                      </SelectItem>
                      <SelectItem value='committed'>
                        {translateDemo('Committed', {
                          defaultValue: 'Committed',
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <div className='rounded-lg border bg-background p-3 text-xs leading-5 text-muted-foreground'>
                  {translateDemo(
                    'No Shortcut is used here. “Prepare opportunity brief” comes from AIChatProvider.employeeTasks and appears in the conversation empty state.',
                    {
                      defaultValue:
                        'No Shortcut is used here. “Prepare opportunity brief” comes from AIChatProvider.employeeTasks and appears in the conversation empty state.',
                    },
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className='min-h-0 border-t bg-card xl:border-l xl:border-t-0'>
            <ChatInline className='h-[560px] rounded-none border-0'>
              <AIChatWindow showConversationToggle={false} disclaimer={false} />
            </ChatInline>
          </div>
        </div>
      </Card>
    </AIChatProvider>
  );
}

function InheritedContextShowcase() {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-ai-employee',
  );

  const { employees } = useAI();
  const employee = employees.filter(isBusinessEmployee)[0]!;
  const controller = useAIChatController();
  const [accountName, setAccountName] = useState('Northwind Finance');
  const [stage, setStage] = useState('negotiation');
  const contextReference = useMemo<AIWorkContextItem>(
    () => ({
      type: 'page-element',
      id: 'inherited-renewal-context',
      title: translateDemo('Current account renewal', {
        defaultValue: 'Current account renewal',
      }),
    }),
    [translateDemo],
  );
  const contextRef = useAIPageElement({
    id: 'inherited-renewal-context',
    title: translateDemo('Current account renewal', {
      defaultValue: 'Current account renewal',
    }),
    kind: 'record-detail',
    getContext: () => ({
      resource: 'accounts',
      record: { accountName, stage },
    }),
  });
  const shortcutTask = useMemo<AIEmployeeTask>(
    () => ({
      title: translateDemo('Review current renewal', {
        defaultValue: 'Review current renewal',
      }),
      message: { user: 'Review the current account renewal.' },
      autoSend: false,
    }),
    [translateDemo],
  );
  const presetTask = useMemo<AIEmployeeTask>(
    () => ({
      title: translateDemo('Recommend next renewal action', {
        defaultValue: 'Recommend next renewal action',
      }),
      message: { user: 'Recommend the next renewal action.' },
      autoSend: false,
    }),
    [translateDemo],
  );
  const employeeTasks = useMemo<AIEmployeeTasks>(
    () => ({ [employee.username]: [presetTask] }),
    [employee.username, presetTask],
  );

  return (
    <AIPageContextScope context={contextReference}>
      <AIChatProvider
        id='inherited-context-demo'
        controller={controller}
        defaultEmployee={employee.username}
        employeeTasks={employeeTasks}
      >
        <Card className='gap-0 overflow-hidden py-0'>
          <div className='grid min-h-[560px] xl:grid-cols-[minmax(0,1fr)_410px]'>
            <div className='bg-muted/15 p-4 sm:p-5'>
              <Card ref={contextRef}>
                <CardHeader>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <CardTitle>
                        {translateDemo('Current account renewal', {
                          defaultValue: 'Current account renewal',
                        })}
                      </CardTitle>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {translateDemo(
                          'Shortcut and conversation are inside this context scope.',
                          {
                            defaultValue:
                              'Shortcut and conversation are inside this context scope.',
                          },
                        )}
                      </p>
                    </div>
                    <Badge variant='outline'>
                      {translateDemo('Inherited', {
                        defaultValue: 'Inherited',
                      })}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <label className='block space-y-2'>
                    <Label htmlFor='inherited-account-name'>
                      {translateDemo('Account', { defaultValue: 'Account' })}
                    </Label>
                    <Input
                      id='inherited-account-name'
                      value={accountName}
                      onChange={(event) => setAccountName(event.target.value)}
                    />
                  </label>
                  <label className='block space-y-2'>
                    <Label>
                      {translateDemo('Renewal stage', {
                        defaultValue: 'Renewal stage',
                      })}
                    </Label>
                    <Select
                      value={stage}
                      onValueChange={(value) => value && setStage(value)}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='discovery'>
                          {translateDemo('Discovery', {
                            defaultValue: 'Discovery',
                          })}
                        </SelectItem>
                        <SelectItem value='negotiation'>
                          {translateDemo('Negotiation', {
                            defaultValue: 'Negotiation',
                          })}
                        </SelectItem>
                        <SelectItem value='committed'>
                          {translateDemo('Committed', {
                            defaultValue: 'Committed',
                          })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <div className='space-y-2 border-t pt-4'>
                    <div className='text-xs text-muted-foreground'>
                      {translateDemo(
                        'Shortcut task without message.workContext',
                        {
                          defaultValue:
                            'Shortcut task without message.workContext',
                        },
                      )}
                    </div>
                    <AIEmployeeShortcut
                      aiEmployee={employee.username}
                      target={controller}
                      tasks={[shortcutTask]}
                      label={translateDemo('Review current renewal', {
                        defaultValue: 'Review current renewal',
                      })}
                      size={34}
                    />
                  </div>
                  <div className='rounded-lg border bg-background p-3 text-xs leading-5 text-muted-foreground'>
                    {translateDemo(
                      'The preset task “Recommend next renewal action” also has no task context, so it inherits this scope.',
                      {
                        defaultValue:
                          'The preset task “Recommend next renewal action” also has no task context, so it inherits this scope.',
                      },
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className='min-h-0 border-t bg-card xl:border-l xl:border-t-0'>
              <ChatInline className='h-[560px] rounded-none border-0'>
                <AIChatWindow
                  showConversationToggle={false}
                  disclaimer={false}
                />
              </ChatInline>
            </div>
          </div>
        </Card>
      </AIChatProvider>
    </AIPageContextScope>
  );
}

function ContextSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className='space-y-5'>
      <div>
        <p className='text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
          {eyebrow}
        </p>
        <h2 className='mt-2 text-xl font-semibold tracking-tight'>{title}</h2>
        <p className='mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground'>
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
