import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createApp } from '../../server/app.js';

const EMPLOYEES_DIR = path.resolve(process.cwd(), 'ai', 'employees');
const DIST_EMPLOYEES_DIR = path.resolve(
  process.cwd(),
  'dist',
  'ai',
  'employees',
);
const BUILTIN_EMPLOYEES = [
  'atlas',
  'dara',
  'dex',
  'ellis',
  'form_assistant',
  'lexi',
  'lina',
  'nathan',
  'vera',
  'viz',
];

describe('built-in and application AI employees', () => {
  it('keeps an application-owned employee fixture under the app resource tree', () => {
    expect(
      fs.existsSync(
        path.join(EMPLOYEES_DIR, 'application-validation', 'index.ts'),
      ),
    ).toBe(true);
  });

  it('loads package builtins before application resources when compiled dist/ai exists', async () => {
    if (!fs.existsSync(DIST_EMPLOYEES_DIR)) return;

    const app = createApp({
      basePath: '/app-template-default',
      aiDirectory: path.resolve(process.cwd(), 'dist', 'ai'),
      nocoBaseApiUrl: false,
    });
    const response = await app.request(
      'http://localhost/app-template-default/v2/api/aiEmployees:listByUser',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': 'root-user',
          'x-roles': 'root',
        },
        body: '{}',
      },
    );
    const payload = (await response.json()) as {
      data: Array<Record<string, any>>;
    };
    const employees = payload.data;
    const found = new Set(employees.map((employee) => employee.username));

    for (const username of BUILTIN_EMPLOYEES) {
      expect(
        found.has(username),
        `built-in employee ${username} must register`,
      ).toBe(true);
    }
    expect(found.has('application-validation')).toBe(true);
    expect(
      employees.find(
        (employee) => employee.username === 'application-validation',
      ),
    ).toMatchObject({
      category: 'developer',
      builtIn: true,
    });
  });
});
