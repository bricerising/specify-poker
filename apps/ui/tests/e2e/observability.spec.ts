import { expect, test } from "@playwright/test";
import { urls } from "./helpers/urls";

type PrometheusQueryResponse = {
  status: string;
  data?: {
    resultType?: string;
    result?: Array<{
      metric?: Record<string, string>;
      value?: [number, string];
    }>;
  };
};

const expectedJobs = ["gateway", "balance", "player", "game", "event", "notify"] as const;

test.describe("Observability Stack", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Observability checks run once.");
  test.setTimeout(60_000);

  test("Mimir ingests metrics from all services", async ({ request }) => {
    await expect.poll(async () => {
      const query = encodeURIComponent("count by (job) (process_cpu_user_seconds_total)");
      const res = await request.get(`${urls.mimir}/prometheus/api/v1/query?query=${query}`);
      if (!res.ok()) {
        return null;
      }
      const json = (await res.json()) as PrometheusQueryResponse;
      if (json.status !== "success") {
        return null;
      }
      const series = json.data?.result ?? [];
      const jobs = new Map<string, number>();
      for (const sample of series) {
        const job = sample.metric?.job ?? "";
        const rawValue = sample.value?.[1] ?? "";
        const value = Number(rawValue);
        if (!job || Number.isNaN(value)) continue;
        jobs.set(job, value);
      }
      const summary = Object.fromEntries(jobs.entries()) as Record<string, number>;
      return summary;
    }, { timeout: 45_000, intervals: [500, 1000, 2000] }).toMatchObject(
      Object.fromEntries(expectedJobs.map((job) => [job, 1])) as Record<string, number>,
    );
  });

  test("gateway exposes Prometheus-format metrics", async ({ request }) => {
    await request.get(`${urls.gateway}/health`);
    const res = await request.get(`${urls.gateway}/metrics`);
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain("process_cpu_user_seconds_total");
    expect(text).toContain("gateway_ws_active_connections");
    expect(text).toContain("gateway_http_request_duration_seconds_bucket");
  });
});
