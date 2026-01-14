import { describe, it, expect, vi, beforeEach } from "vitest";

const loadSync = vi.fn(() => ({}));
const loadPackageDefinition = vi.fn();
const createInsecure = vi.fn(() => "creds");

vi.mock("@grpc/proto-loader", () => ({
  loadSync,
}));

vi.mock("@grpc/grpc-js", () => ({
  loadPackageDefinition,
  credentials: { createInsecure },
}));

vi.mock("../../../src/config", () => ({
  getConfig: () => ({
    gameServiceUrl: "game:1234",
    playerServiceUrl: "player:1234",
    balanceServiceUrl: "balance:1234",
    eventServiceUrl: "event:1234",
    notifyServiceUrl: "notify:1234",
  }),
}));

describe("gRPC clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("constructs clients from loaded protos", async () => {
    const ctor = vi.fn();
    loadPackageDefinition.mockReturnValue({
      game: { GameService: ctor },
      player: { PlayerService: ctor },
      balance: { BalanceService: ctor },
      event: { EventService: ctor },
      notify: { NotifyService: ctor },
    });

    const module = await import("../../../src/grpc/clients");

    expect(loadSync).toHaveBeenCalledTimes(5);
    expect(createInsecure).toHaveBeenCalledTimes(5);
    expect(ctor).toHaveBeenCalledWith("game:1234", "creds");
    expect(ctor).toHaveBeenCalledWith("player:1234", "creds");
    expect(ctor).toHaveBeenCalledWith("balance:1234", "creds");
    expect(ctor).toHaveBeenCalledWith("event:1234", "creds");
    expect(ctor).toHaveBeenCalledWith("notify:1234", "creds");
    expect(module.gameClient).toBeDefined();
    expect(module.playerClient).toBeDefined();
    expect(module.balanceClient).toBeDefined();
    expect(module.eventClient).toBeDefined();
    expect(module.notifyClient).toBeDefined();
  });
});
