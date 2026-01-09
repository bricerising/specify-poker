import { NextFunction, Request, Response } from "express";

import { getTracer } from "./otel";

export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const tracer = getTracer();
  const span = tracer.startSpan("api.http.request", {
    attributes: {
      "http.method": req.method,
      "http.route": req.path,
    },
  });

  res.on("finish", () => {
    span.setAttribute("http.status_code", res.statusCode);
    span.end();
  });

  next();
}
