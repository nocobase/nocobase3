export interface ProxyRequestOptions {
  headers?: Headers;
  unavailableMessage: string;
}

export async function proxyRequest(request: Request, targetUrl: URL, options: ProxyRequestOptions): Promise<Response> {
  const headers = options.headers ?? new Headers(request.headers);
  headers.set('host', targetUrl.host);
  headers.set('accept-encoding', 'identity');
  removeHopByHopHeaders(headers);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      signal: request.signal,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: createProxyResponseHeaders(response.headers),
    });
  } catch (error) {
    return Response.json(
      {
        error: options.unavailableMessage,
        target: targetUrl.origin,
        message: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
      },
    );
  }
}

export function createProxyResponseHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  removeHopByHopHeaders(nextHeaders);
  nextHeaders.delete('content-encoding');
  nextHeaders.delete('content-length');
  return nextHeaders;
}

export function removeHopByHopHeaders(headers: Headers): void {
  for (const header of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(header);
  }
}
