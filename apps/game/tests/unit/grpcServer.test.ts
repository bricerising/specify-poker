import { describe, expect, it, vi } from "vitest";

const grpcState = vi.hoisted(() => ({
  addService: vi.fn(),
  bindAsync: vi.fn((addr: string, _creds: unknown, cb: (err: Error | null, port: number) => void) =>
    cb(null, parseInt(addr.split(":").pop() || "0", 10)),
  ),
  forceShutdown: vi.fn(),
}));

vi.mock("@grpc/grpc-js", () => ({
  Server: class {
    addService = grpcState.addService;
    bindAsync = grpcState.bindAsync;
    forceShutdown = grpcState.forceShutdown;
  },
  ServerCredentials: { createInsecure: () => ({}) },
  loadPackageDefinition: () => ({
    game: { GameService: { service: { name: "GameService" } } },
  }),
}));

vi.mock("@grpc/proto-loader", () => ({
  loadSync: () => ({}),
}));

vi.mock("../../src/api/grpc/handlers", () => ({
  createHandlers: () => ({}),
}));

vi.mock("../../src/observability/logger", () => ({
  default: { info: vi.fn() },
}));

describe("gRPC server", () => {
  it("starts and stops the server", async () => {
    const { startGrpcServer, stopGrpcServer } = await import("../../src/api/grpc/server");

    await startGrpcServer(5555);
    expect(grpcState.addService).toHaveBeenCalledTimes(1);
    expect(grpcState.bindAsync).toHaveBeenCalledTimes(1);

    stopGrpcServer();
    expect(grpcState.forceShutdown).toHaveBeenCalledTimes(1);
  });
});
