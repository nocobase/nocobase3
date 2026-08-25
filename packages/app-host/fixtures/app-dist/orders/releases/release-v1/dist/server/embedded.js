export function createServer(scope) {
  return {
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/healthz') {
        return Response.json({ ok: true, releaseId: scope.releaseId });
      }

      return Response.json({
        app: 'orders',
        label: 'Orders V1',
        version: '1.0.0',
        releaseId: scope.releaseId,
      });
    },
  };
}
