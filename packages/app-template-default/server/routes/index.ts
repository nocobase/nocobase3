import type { Application } from '@nocobase/app-server-kit/application';
import {
  defineRootRoutes,
  type AppRootRoutes,
} from '@nocobase/app-server-kit/router';

import { appExampleServiceToken } from '../providers/index.js';

const exampleRootRoutes: AppRootRoutes<Application> = defineRootRoutes({
  name: '@nocobase/app-template-default/root/example',
  register(router, app): void {
    router.get('/example', (context) => {
      const exampleService = app.container.resolve(appExampleServiceToken);

      return context.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Application Route Example</title>
  </head>
  <body>
    <main>
      <h1>Application Route Example</h1>
      <p>${exampleService.getMessage()}</p>
    </main>
  </body>
</html>`);
    });
  },
});

const rootRoutes: readonly AppRootRoutes<Application>[] = [exampleRootRoutes];

export default rootRoutes;
