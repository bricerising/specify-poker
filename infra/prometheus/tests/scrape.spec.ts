import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("prometheus config", () => {
  it("scrapes otel collector metrics", () => {
    const configPath = join(__dirname, "..", "prometheus.yaml");
    const config = readFileSync(configPath, "utf8");
    expect(config).toContain("otel-collector:8889");
  });
});
