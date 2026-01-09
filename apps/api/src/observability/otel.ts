import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

let provider: BasicTracerProvider | null = null;
let exporter: InMemorySpanExporter | null = null;
let initialized = false;

export function initApiTelemetry(options: { useInMemory?: boolean } = {}) {
  if (initialized) {
    if (options.useInMemory && !exporter && provider) {
      exporter = new InMemorySpanExporter();
      provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    }
    return { exporter };
  }

  provider = new BasicTracerProvider();
  exporter = options.useInMemory ? new InMemorySpanExporter() : null;
  const spanExporter = exporter ?? new ConsoleSpanExporter();

  provider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
  provider.register();
  initialized = true;

  return { exporter };
}

export function getTracer() {
  return trace.getTracer("api");
}

export function getInMemoryExporter() {
  return exporter;
}
