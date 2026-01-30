import type { ApiClient } from './apiClient';

export type JsonRequestInit = Omit<RequestInit, 'body'> & {
  /**
   * JSON payload to be stringified into `body` with `Content-Type: application/json`.
   *
   * Use `json: null` to send a JSON null body.
   */
  readonly json?: unknown;
};

export type JsonApiClient = {
  request(path: string, init?: JsonRequestInit): Promise<Response>;
  requestDecoded<T>(
    path: string,
    decode: (payload: unknown) => T,
    init?: JsonRequestInit,
  ): Promise<T>;
};

function toJsonRequestInit(init: JsonRequestInit | undefined): RequestInit {
  if (!init) {
    return {};
  }

  const { json, headers: headersFromInit, ...rest } = init;
  const headers = new Headers(headersFromInit);

  if (json !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const requestInit: RequestInit = { ...rest, headers };

  if (json !== undefined) {
    requestInit.body = JSON.stringify(json);
  }

  return requestInit;
}

export function createJsonApiClient(client: ApiClient): JsonApiClient {
  const request: JsonApiClient['request'] = async (path, init) => {
    return client.fetch(path, toJsonRequestInit(init));
  };

  const requestDecoded: JsonApiClient['requestDecoded'] = async (path, decode, init) => {
    return client.fetchDecoded(path, decode, toJsonRequestInit(init));
  };

  return { request, requestDecoded };
}

