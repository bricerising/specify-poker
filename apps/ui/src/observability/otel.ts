import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

let initialized = false;

export function initUiTelemetry() {
  if (initialized) {
    return;
  }

  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  initialized = true;
}

export function recordNavigation(path: string) {
  const tracer = trace.getTracer("ui");
  const span = tracer.startSpan("ui.navigation", {
    attributes: {
      "ui.path": path,
    },
  });
  span.end();
}
