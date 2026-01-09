import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { getInMemoryExporter } from "../../src/observability/otel";

describe("otel telemetry", () => {
  it("emits api.http.request spans", async () => {
    const app = createApp({ useInMemoryTelemetry: true });

    await request(app).get("/api/health");

    const exporter = getInMemoryExporter();
    const spans = exporter?.getFinishedSpans() ?? [];
    const names = spans.map((span) => span.name);

    expect(names).toContain("api.http.request");
  });
});
