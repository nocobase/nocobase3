export function createServer(scope) {
  return {
    fetch(request) {
      const url = new URL(request.url);

      return Response.json({
        id: scope.id,
        basePath: scope.basePath,
        requestPath: url.pathname,
        message: 'server-only fixture',
      });
    },
  };
}
