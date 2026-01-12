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

export function startObservability() {
  sdk.start();
  logger.info("OpenTelemetry SDK started");
}

export async function stopObservability() {
  await sdk.shutdown();
  logger.info("OpenTelemetry SDK shut down");
}
