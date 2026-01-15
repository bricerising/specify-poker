import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("otel collector metrics scraping", () => {
  const configPath = join(__dirname, "..", "collector-config.yaml");
  const config = readFileSync(configPath, "utf8");

  it("scrapes service /metrics endpoints", () => {
    expect(config).toContain("gateway:4000");
    expect(config).toContain("balance:9102");
    expect(config).toContain("player:9103");
    expect(config).toContain("game:9105");
    expect(config).toContain("event:9104");
    expect(config).toContain("notify:9105");
  });

  it("remote-writes metrics to mimir", () => {
    expect(config).toContain("prometheusremotewrite");
    expect(config).toContain("http://mimir:9009/api/v1/push");
  });
});
