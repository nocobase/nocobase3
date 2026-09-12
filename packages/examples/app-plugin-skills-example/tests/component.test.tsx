import { describe, expect, it } from 'vitest';

import { AppNotice } from '../client/components/app-notice.js';

describe('@nocobase/app-plugin-skills-example', () => {
  it('renders the public App Notice component', () => {
    const notice = AppNotice({
      title: 'Hello',
      description: 'From the plugin',
      tone: 'warning',
    });

    expect(notice.type).toBe('aside');
    expect(notice).toHaveProperty('props.children.0.props.children', 'Hello');
    expect(notice).toHaveProperty(
      'props.children.1.props.children',
      'From the plugin',
    );
  });
});
