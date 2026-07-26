import queryString from 'query-string';
import { ErrorMessage } from './enum';

export const fetchData = ({
  url,
  method = 'GET',
  body,
  headers = new Headers(),
  timeout = 10000,
  authErrorMessage,
}: FetchData) => {
  const controller = new AbortController();
  const init: RequestInit & { headers: Headers } = {
    method: method.toUpperCase(),
    headers,
    signal: controller.signal,
    redirect: 'follow',
    credentials: 'include',
  };

  const hasBody = body instanceof FormData || (!!body && Object.keys(body).length > 0);
  if (hasBody) {
    if (init.method === 'GET') {
      url = queryString.stringifyUrl({ url, query: body as Record<string, any> });
    }
    if (init.method === 'POST') {
      if (body instanceof FormData) {
        // 让 fetch 自动生成带 boundary 的 Content-Type。
        init.headers.delete('Content-Type');
        init.body = body;
      } else {
        if (!init.headers.has('Content-Type')) {
          init.headers?.set('Content-Type', 'application/json');
        }
        init.body = JSON.stringify(body);
      }
    }
  }

  const delay = setTimeout(() => {
    controller.abort();
  }, timeout);

  return fetch(url, init)
    .then(async (response) => {
      if (!response.ok) {
        const message =
          authErrorMessage && (response.status === 401 || response.status === 403)
            ? authErrorMessage
            : ErrorMessage.HttpRequestFail.replace('{status}', String(response.status));
        return {
          error: new Error(message),
          data: undefined,
        };
      }
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      return { error: undefined, data };
    })
    .catch((error: unknown) => ({
      error: new Error(
        controller.signal.aborted
          ? ErrorMessage.RequestTimeout
          : error instanceof Error
          ? `${ErrorMessage.WrongResponse}${error.message}`
          : ErrorMessage.Unknown
      ),
      data: undefined,
    }))
    .finally(() => {
      clearTimeout(delay);
    });
};
