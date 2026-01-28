import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { getConfig } from "../config";
import logger from "./logger";

let sdk: NodeSDK | null = null;
let startPromise: Promise<void> | null = null;
let shutdownPromise: Promise<void> | null = null;

function getSdk(): NodeSDK {
  if (sdk) {
    return sdk;
  }

  const config = getConfig();
  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "notify-service",
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.otelExporterEndpoint,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  return sdk;
}

export async function startObservability(): Promise<void> {
  if (startPromise) {
    await startPromise;
    return;
  }

  startPromise = Promise.resolve(getSdk().start());
  await startPromise;
  logger.info("OpenTelemetry SDK started");
}

export async function stopObservability(): Promise<void> {
  if (!sdk) {
    return;
  }

  if (shutdownPromise) {
    await shutdownPromise;
    return;
  }

  shutdownPromise = Promise.resolve(sdk.shutdown());
  await shutdownPromise;
  logger.info("OpenTelemetry SDK shut down");

  sdk = null;
  startPromise = null;
  shutdownPromise = null;
}
