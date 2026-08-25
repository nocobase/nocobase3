export function createServer(scope) {
  return {
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/healthz') {
        return Response.json(
          {
            ok: false,
            releaseId: scope.releaseId,
            reason: 'database migration readiness failed',
          },
          { status: 503 },
        );
      }

      return Response.json({
        app: 'orders',
        label: 'Orders V3 (unhealthy candidate)',
        version: '3.0.0',
        releaseId: scope.releaseId,
      });
    },
  };
}
