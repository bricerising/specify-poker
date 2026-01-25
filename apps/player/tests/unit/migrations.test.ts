import { describe, it, expect, beforeEach, vi } from "vitest";

const connect = vi.fn();
const query = vi.fn();
const release = vi.fn();

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => ["001_initial.sql", "002_add_username.sql"]),
  readFileSync: vi.fn(() => "SELECT 1;"),
  default: {
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => ["001_initial.sql", "002_add_username.sql"]),
    readFileSync: vi.fn(() => "SELECT 1;"),
  },
}));

vi.mock("../../src/observability/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../src/storage/db", () => ({
  default: {
    connect: () => connect(),
  },
}));

describe("migrations runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ query, release });
  });

  it("runs migrations successfully", async () => {
    const { runMigrations } = await import("../../src/storage/migrations");

    await runMigrations();

    expect(query).toHaveBeenCalledWith("BEGIN");
    expect(query).toHaveBeenCalledWith("SELECT 1;");
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("rolls back on migration failure", async () => {
    query.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const { runMigrations } = await import("../../src/storage/migrations");

    await expect(runMigrations()).rejects.toThrow("boom");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });
});
