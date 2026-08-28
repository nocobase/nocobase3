import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

/** A small application-owned tool used to verify layered resource loading. */
export default defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  definition: {
    name: 'application-validation',
    description:
      'Reports that the application AI resource directory was loaded.',
    schema: z.object({ value: z.string().optional() }),
  },
  invoke: async (_context, args: { value?: string }) => ({
    status: 'success',
    content: args.value ?? 'application resource loaded',
  }),
});
