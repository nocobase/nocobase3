import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { describe, expect, it } from 'vitest';
import authorization from '../client/plugin.js';
import {
  ManagementToolbar,
  RuleEditorLayout,
} from '../client/components/management-ui.js';
import { ErrorBox } from '../client/components/feedback.js';

describe('authorization translations', () => {
  it('registers translations and translates controls, steps and errors in its own namespace', async () => {
    const plugin = authorization();
    const runtime = new I18nRuntime({
      applicationNamespace: 'app',
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    runtime.registerApplicationNamespace('app', {
      'en-US': async () => ({ default: {} }),
    });
    runtime.registerNamespace(plugin.packageName, plugin.locales ?? {});
    await runtime.init('zh-CN');
    const output = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { runtime },
        <>
          <ManagementToolbar
            search=''
            onSearch={() => {}}
            actionLabel='Custom action'
            onAction={() => {}}
          />
          <RuleEditorLayout
            steps={[
              {
                value: 'resource',
                label: 'Resource',
                description: 'Select a collection.',
              },
            ]}
            value='resource'
            onChange={() => {}}
            footer={null}
          >
            {null}
          </RuleEditorLayout>
          <ErrorBox value='Complete the rule before saving.' />
        </>,
      ),
    );
    expect(output).toContain('搜索');
    expect(output).toContain('资源');
    expect(output).toContain('选择一个数据表。');
    expect(output).toContain('请填写完整规则后再保存。');
    expect(output).toContain('Custom action');
    expect(runtime.i18n.t('permissionSets', { ns: plugin.packageName })).toBe(
      '权限集',
    );
  });
});
