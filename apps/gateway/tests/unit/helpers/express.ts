import type { Request, Response, Router } from "express";

type MockAuth = {
  userId: string;
  token?: string;
  claims?: Record<string, unknown>;
};

type MockRequestOptions = {
  method: string;
  url: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  auth?: MockAuth;
  protocol?: string;
};

type MockResponse = Response & {
  statusCode: number;
  body?: unknown;
  finished: boolean;
  headers: Record<string, string>;
};

export function createMockReq(options: MockRequestOptions): Request {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (typeof value === "string") {
      headers[key.toLowerCase()] = value;
    }
  }

  const req = {
    method: options.method,
    url: options.url,
    headers,
    body: options.body,
    query: options.query ?? {},
    params: {},
    protocol: options.protocol ?? "http",
    auth: options.auth,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;

  return req;
}

export function createMockRes(): { res: MockResponse; done: Promise<MockResponse> } {
  let resolveDone: (res: MockResponse) => void;
  const done = new Promise<MockResponse>((resolve) => {
    resolveDone = resolve;
  });

  const listeners: Record<string, Array<() => void>> = {};

  const emit = (event: string) => {
    for (const listener of listeners[event] ?? []) {
      listener();
    }
  };

  const res = {
    statusCode: 200,
    body: undefined,
    finished: false,
    headers: {},
    on(event: string, listener: () => void) {
      listeners[event] = [...(listeners[event] ?? []), listener];
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.finished = true;
      this.headers["content-type"] = "application/json";
      emit("finish");
      resolveDone(this);
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      this.finished = true;
      emit("finish");
      resolveDone(this);
      return this;
    },
    end(payload?: unknown) {
      if (payload !== undefined) {
        this.body = payload;
      }
      this.finished = true;
      emit("finish");
      resolveDone(this);
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    set(field: string | Record<string, string>, value?: string) {
      if (typeof field === "string" && typeof value === "string") {
        this.headers[field.toLowerCase()] = value;
      } else if (typeof field === "object") {
        for (const [key, val] of Object.entries(field)) {
          this.headers[key.toLowerCase()] = val;
        }
      }
      return this;
    },
  } as MockResponse;

  return { res, done };
}

export async function dispatchToRouter(
  router: Router,
  options: MockRequestOptions
): Promise<MockResponse> {
  const req = createMockReq(options);
  const { res, done } = createMockRes();

  router.handle(req, res, (err?: unknown) => {
    if (res.finished) {
      return;
    }
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: "Not found" });
  });

  return done;
}
