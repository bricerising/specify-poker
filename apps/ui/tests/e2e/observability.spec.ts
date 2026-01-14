import { expect, test } from "@playwright/test";
import { urls } from "./helpers/urls";

type PrometheusTargetsResponse = {
  status: string;
  data?: {
    activeTargets?: Array<{
      labels?: Record<string, string>;
      discoveredLabels?: Record<string, string>;
      health?: string;
    }>;
  };
};

const expectedJobs = ["otel-collector", "gateway", "balance", "player", "game", "event", "notify"] as const;

test.describe("Observability Stack", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Observability checks run once.");
  test.setTimeout(60_000);

  test("Prometheus scrapes all service targets", async ({ request }) => {
    await expect.poll(async () => {
      const res = await request.get(`${urls.prometheus}/api/v1/targets`);
      if (!res.ok()) {
        return null;
      }
      const json = (await res.json()) as PrometheusTargetsResponse;
      if (json.status !== "success") {
        return null;
      }
      const activeTargets = json.data?.activeTargets ?? [];
      const jobs = new Map<string, string>();
      for (const target of activeTargets) {
        const job = target.labels?.job ?? target.discoveredLabels?.job ?? "";
        if (!job) continue;
        jobs.set(job, target.health ?? "unknown");
      }
      const summary = Object.fromEntries(jobs.entries()) as Record<string, string>;
      return summary;
    }, { timeout: 45_000, intervals: [500, 1000, 2000] }).toMatchObject(
      Object.fromEntries(expectedJobs.map((job) => [job, "up"])) as Record<string, string>,
    );
  });

  test("gateway exposes Prometheus metrics", async ({ request }) => {
    const res = await request.get(`${urls.gateway}/metrics`);
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain("process_cpu_user_seconds_total");
  });
});

