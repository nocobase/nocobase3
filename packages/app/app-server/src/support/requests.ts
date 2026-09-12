interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

export function cloneRequestWithUrl(
  request: Request,
  url: URL,
  headers: Headers = request.headers,
): Request {
  const init: RequestInitWithDuplex = {
    method: request.method,
    headers,
    signal: request.signal,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}
