import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type MiddlewareHandler } from 'hono';

import { CLOCK_TOPIC } from '../publishers/clock.js';

export interface RealtimeExamplePluginRoutesDeps {
  readonly auth: {
    required(): MiddlewareHandler;
  };
}

export type RealtimeExamplePluginRoutesContext =
  AppPluginRoutesContext<RealtimeExamplePluginRoutesDeps>;

export default ({ app, deps }: RealtimeExamplePluginRoutesContext): void => {
  const routes = new Hono();

  routes.get('/', deps.auth.required(), (context) =>
    context.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>NocoBase Realtime</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1b1f24;
        background: #f6f7f9;
      }

      main {
        width: min(520px, calc(100vw - 48px));
      }

      h1 {
        margin: 0 0 16px;
        font-size: 28px;
        font-weight: 650;
      }

      #now-time {
        min-height: 48px;
        padding: 18px 20px;
        border: 1px solid #d7dce2;
        border-radius: 8px;
        background: #ffffff;
        font-size: 20px;
        line-height: 1.4;
      }

      #realtime-status {
        margin-top: 12px;
        color: #667085;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Realtime</h1>
      <div id="now-time">--</div>
      <div id="realtime-status">connecting</div>
    </main>
    <script>
      const pathname = location.pathname.endsWith('/')
        ? location.pathname.slice(0, -1)
        : location.pathname;
      const websocketPath = pathname.endsWith('/realtime')
        ? pathname.slice(0, -'/realtime'.length) + '/ws'
        : '/ws';
      const topic = ${JSON.stringify(CLOCK_TOPIC)};
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(protocol + '//' + location.host + websocketPath);
      const nowTime = document.getElementById('now-time');
      const status = document.getElementById('realtime-status');

      ws.addEventListener('open', () => {
        status.textContent = 'connected';
        ws.send(JSON.stringify({
          type: 'subscribe',
          id: 'clock',
          topic,
        }));
      });

      ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'event' && message.topic === topic) {
          nowTime.textContent = String(message.payload);
        }
      });

      ws.addEventListener('close', () => {
        status.textContent = 'closed';
      });

      ws.addEventListener('error', () => {
        status.textContent = 'error';
      });
    </script>
  </body>
</html>`),
  );

  app.route('/realtime', routes);
};
