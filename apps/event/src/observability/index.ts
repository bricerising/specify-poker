import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { config } from "../config";
import logger from "./logger";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "event-service",
  }),
  traceExporter: new OTLPTraceExporter({
    url: config.otelExporterEndpoint,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

let startPromise: Promise<void> | null = null;
let shutdownPromise: Promise<void> | null = null;

export async function startObservability(): Promise<void> {
  if (startPromise) {
    await startPromise;
    return;
  }
  startPromise = Promise.resolve(sdk.start());
  await startPromise;
  logger.info("OpenTelemetry SDK started");
}

export async function stopObservability(): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise;
    return;
  }
  shutdownPromise = Promise.resolve(sdk.shutdown());
  await shutdownPromise;
  logger.info("OpenTelemetry SDK shut down");
}
