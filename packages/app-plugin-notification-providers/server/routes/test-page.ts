export const TEST_PAGE_HTML: string = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NocoBase notification Provider test</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f6f8; color: #182230; }
      main { width: min(680px, calc(100vw - 40px)); padding: 28px; border: 1px solid #d7dee8; border-radius: 14px; background: white; box-shadow: 0 12px 32px rgb(16 24 40 / 10%); }
      h1 { margin: 0 0 8px; font-size: 24px; } p { color: #667085; line-height: 1.5; }
      .warning { padding: 12px; border-radius: 8px; background: #fff4e5; color: #8a4b08; }
      .providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 20px 0; }
      button { width: 100%; padding: 12px 14px; border: 0; border-radius: 8px; background: #155eef; color: white; font-weight: 600; cursor: pointer; }
      button:disabled { cursor: wait; opacity: .55; } #status { min-height: 24px; white-space: pre-wrap; }
      @media (prefers-color-scheme: dark) { body { background: #111827; color: #f9fafb; } main { background: #1f2937; border-color: #374151; } p { color: #b6c2d2; } .warning { background: #422006; color: #fed7aa; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Notification Provider test</h1>
      <p>Send one real test message through the configured Notification Manager. The email target is <code>TEST_EMAIL_RECIPIENT</code>; IM messages go to the configured bot group.</p>
      <div class="warning">This page is for development and verification. It is disabled by default in production.</div>
      <div id="providers" class="providers">Loading configured Providers…</div>
      <div id="status" role="status"></div>
    </main>
    <script>
      const base = location.pathname.endsWith('/')
        ? location.pathname.slice(0, -1)
        : location.pathname;
      const providers = document.getElementById('providers');
      const status = document.getElementById('status');
      const label = (item) => item.channel + ' / ' + item.provider.name + ' (' + item.provider.type + ')';
      async function load() {
        const response = await fetch(base + '/config');
        if (!response.ok) throw new Error('Unable to load Provider configuration (' + response.status + ').');
        const result = await response.json();
        providers.replaceChildren();
        for (const item of result.data) {
          const button = document.createElement('button');
          button.textContent = 'Send via ' + label(item);
          button.addEventListener('click', () => send(item, button));
          providers.append(button);
        }
        if (!result.data.length) providers.textContent = 'No enabled Providers are configured.';
      }
      async function send(item, button) {
        button.disabled = true; status.textContent = 'Submitting…';
        try {
          const response = await fetch(base + '/send', { method: 'POST', headers: { 'content-type': 'application/json', 'x-nocobase-provider-test': '1' }, body: JSON.stringify({ channel: item.channel, providerName: item.provider.name, providerType: item.provider.type }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Provider test failed.');
          status.textContent = 'Accepted as ' + result.data.notificationId + '. Checking delivery status…';
          await poll(result.data.notificationId);
        } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
        finally { button.disabled = false; }
      }
      async function poll(id) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const response = await fetch(base + '/status/' + encodeURIComponent(id));
          if (!response.ok) return;
          const result = await response.json();
          const deliveries = result.data.deliveries.map((item) => item.delivery.status).join(', ');
          status.textContent = 'Notification ' + result.data.log.status + '; delivery: ' + deliveries;
          if (!['pending', 'processing'].includes(result.data.log.status)) return;
        }
      }
      load().catch((error) => { providers.textContent = error instanceof Error ? error.message : String(error); });
    </script>
  </body>
</html>`;
