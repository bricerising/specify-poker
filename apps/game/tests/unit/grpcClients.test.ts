import { describe, expect, it, vi } from "vitest";

const clientState = vi.hoisted(() => ({
  balanceArgs: [] as unknown[],
  eventArgs: [] as unknown[],
}));

vi.mock("@grpc/grpc-js", () => ({
  credentials: { createInsecure: () => ({}) },
  loadPackageDefinition: () => ({
    balance: {
      BalanceService: class {
        constructor(addr: string, creds: unknown) {
          clientState.balanceArgs = [addr, creds];
        }
      },
    },
    event: {
      EventService: class {
        constructor(addr: string, creds: unknown) {
          clientState.eventArgs = [addr, creds];
        }
      },
    },
  }),
}));

vi.mock("@grpc/proto-loader", () => ({
  loadSync: () => ({}),
}));

describe("gRPC clients module", () => {
  it("creates balance and event clients with configured addresses", async () => {
    await import("../../src/api/grpc/clients");

    expect(clientState.balanceArgs[0]).toBe("localhost:50051");
    expect(clientState.eventArgs[0]).toBe("localhost:50054");
  });
});
