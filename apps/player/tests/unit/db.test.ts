import { describe, it, expect, beforeEach, vi } from "vitest";

const poolQuery = vi.fn();
const poolConnect = vi.fn();

vi.mock("pg", () => ({
  Pool: vi.fn(() => ({
    query: poolQuery,
    connect: poolConnect,
  })),
}));

describe("db utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards query calls to the pool", async () => {
    const { query } = await import("../../src/storage/db");
    poolQuery.mockResolvedValue({ rows: [] });

    await query("SELECT 1", []);

    expect(poolQuery).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("commits transactions on success", async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(client);

    const { transaction } = await import("../../src/storage/db");

    const result = await transaction(async () => "ok");

    expect(result).toBe("ok");
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("rolls back transactions on error", async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(client);

    const { transaction } = await import("../../src/storage/db");

    await expect(
      transaction(async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow("fail");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});
