export function createServer(scope) {
  return {
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/healthz') {
        return Response.json({ ok: true, releaseId: scope.releaseId });
      }

      return Response.json({
        app: 'orders',
        label: 'Orders V2',
        version: '2.0.0',
        releaseId: scope.releaseId,
        feature: 'agent-generated approval summary',
      });
    },
  };
}
