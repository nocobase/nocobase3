import { useMemo, useState } from 'react';
import { useTranslate } from '@refinedev/core';

import { PromptOutput } from '@/components/demo/prompt-output';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type AuthIntegrationPattern = 'dynamic' | 'method' | 'page';

const authDemoPatternValues: AuthIntegrationPattern[] = [
  'dynamic',
  'method',
  'page',
];

export function AuthDemoPromptGenerator({
  value,
  onValueChange,
  patterns,
}: {
  value?: AuthIntegrationPattern;
  onValueChange?: (value: AuthIntegrationPattern) => void;
  patterns?: AuthIntegrationPattern[];
}) {
  const translate = useTranslate();
  const [localPattern, setLocalPattern] = useState<AuthIntegrationPattern>(
    value ?? patterns?.[0] ?? 'method',
  );
  const pattern = value ?? localPattern;
  const availablePatterns = patterns ?? authDemoPatternValues;
  const setPattern = (next: AuthIntegrationPattern) => {
    setLocalPattern(next);
    onValueChange?.(next);
  };
  const prompt = useMemo(() => {
    if (pattern === 'method') {
      return translate(
        'hub.development.authPrompt.method',
        "Customize the Starter login page by replacing only one configured authenticator. Keep the default dynamic authenticator discovery and default UI for every other method. Reuse that Registry's headless sign-in hook so token callbacks, the X-Authenticator header, logout, and redirect behavior remain unchanged.",
      );
    }
    if (pattern === 'page') {
      return translate(
        'hub.development.authPrompt.page',
        'Create a fully custom login page for this Starter. Preserve the built-in authentication runtime, callback token capture, current authenticator storage, X-Authenticator request header, role reset, and SSO logout redirect. Keep installed authentication hooks available to the custom page.',
      );
    }
    return translate(
      'hub.development.authPrompt.dynamic',
      "Keep the Starter's default dynamic login page unchanged.",
    );
  }, [pattern, translate]);
  const getPatternLabel = (key: AuthIntegrationPattern) =>
    translate(`hub.development.authPrompt.pattern.${key}`, patternLabels[key]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {translate(
            'hub.development.authPrompt.generator',
            'Prompt generator',
          )}
        </CardTitle>
        <CardDescription>
          {translate(
            'hub.development.authPrompt.generatorDescription',
            'Generate an implementation prompt for an application-owned login UI.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]'>
        <div className='space-y-2'>
          <Label>
            {translate(
              'hub.development.authPrompt.integrationPattern',
              'Integration pattern',
            )}
          </Label>
          <Select
            value={pattern}
            onValueChange={(next) => setPattern(next as AuthIntegrationPattern)}
          >
            <SelectTrigger className='w-full'>
              <SelectValue>{getPatternLabel(pattern)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availablePatterns.map((key) => (
                <SelectItem key={key} value={key}>
                  {getPatternLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PromptOutput
          title={translate(
            'hub.development.authPrompt.generated',
            'Generated implementation prompt',
          )}
          description={translate(
            'hub.development.authPrompt.generatedDescription',
            'Updates when the customization boundary changes.',
          )}
          copiedLabel={translate('hub.common.copied', 'Copied')}
          copyErrorLabel={translate(
            'hub.common.copyError',
            'Clipboard access failed. Select the prompt and copy it manually.',
          )}
          copyLabel={translate('hub.common.copyPrompt', 'Copy prompt')}
          prompt={prompt}
          promptClassName='min-h-36'
        />
      </CardContent>
    </Card>
  );
}

const patternLabels: Record<AuthIntegrationPattern, string> = {
  dynamic: 'Use the default dynamic login',
  method: 'Replace one authentication method',
  page: 'Replace the complete login page',
};
