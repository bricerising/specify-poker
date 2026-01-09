"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const otel_1 = require("../../src/observability/otel");
(0, vitest_1.describe)("otel telemetry", () => {
    (0, vitest_1.it)("emits api.http.request spans", async () => {
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        await (0, supertest_1.default)(app).get("/api/health");
        const exporter = (0, otel_1.getInMemoryExporter)();
        const spans = exporter?.getFinishedSpans() ?? [];
        const names = spans.map((span) => span.name);
        (0, vitest_1.expect)(names).toContain("api.http.request");
    });
});
