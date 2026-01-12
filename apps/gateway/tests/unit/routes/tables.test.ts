import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import tablesRouter from "../../../src/http/routes/tables";

// Mock the gRPC client
vi.mock("../../../src/grpc/clients", () => ({
  gameClient: {
    ListTables: vi.fn(),
    CreateTable: vi.fn(),
    GetTable: vi.fn(),
    DeleteTable: vi.fn(),
    GetTableState: vi.fn(),
    JoinSeat: vi.fn(),
    LeaveSeat: vi.fn(),
    JoinSpectator: vi.fn(),
    LeaveSpectator: vi.fn(),
    SubmitAction: vi.fn(),
    KickPlayer: vi.fn(),
    MutePlayer: vi.fn(),
    UnmutePlayer: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { gameClient } from "../../../src/grpc/clients";

describe("Tables Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Add mock auth middleware
    app.use((req, _res, next) => {
      (req as any).auth = { userId: "user-123", claims: {} };
      next();
    });
    app.use("/api/tables", tablesRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/tables", () => {
    it("should return list of tables", async () => {
      const mockTables = [
        { table_id: "t1", name: "Table 1" },
        { table_id: "t2", name: "Table 2" },
      ];

      vi.mocked(gameClient.ListTables).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { tables: mockTables });
        }
      );

      const response = await request(app).get("/api/tables");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTables);
    });

    it("should handle errors", async () => {
      vi.mocked(gameClient.ListTables).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error("Connection failed"), null);
        }
      );

      const response = await request(app).get("/api/tables");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to list tables");
    });
  });

  describe("POST /api/tables", () => {
    it("should create a table", async () => {
      const mockTable = { table_id: "t1", name: "New Table" };

      vi.mocked(gameClient.CreateTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockTable);
        }
      );

      const response = await request(app)
        .post("/api/tables")
        .send({ name: "New Table", config: { smallBlind: 1, bigBlind: 2 } });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockTable);
    });
  });

  describe("GET /api/tables/:tableId", () => {
    it("should return table details", async () => {
      const mockTable = { table_id: "t1", name: "Table 1" };

      vi.mocked(gameClient.GetTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockTable);
        }
      );

      const response = await request(app).get("/api/tables/t1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTable);
    });

    it("should return 404 for non-existent table", async () => {
      vi.mocked(gameClient.GetTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error("Not found"), null);
        }
      );

      const response = await request(app).get("/api/tables/not-found");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/tables/:tableId/seats/:seatId/join", () => {
    it("should join a seat successfully", async () => {
      vi.mocked(gameClient.JoinSeat).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        }
      );

      const response = await request(app)
        .post("/api/tables/t1/seats/0/join")
        .send({ buyInAmount: 200 });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it("should return error when seat not available", async () => {
      vi.mocked(gameClient.JoinSeat).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: false, error: "SEAT_NOT_AVAILABLE" });
        }
      );

      const response = await request(app)
        .post("/api/tables/t1/seats/0/join")
        .send({ buyInAmount: 200 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("SEAT_NOT_AVAILABLE");
    });
  });

  describe("POST /api/tables/:tableId/action", () => {
    it("should submit an action successfully", async () => {
      vi.mocked(gameClient.SubmitAction).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        }
      );

      const response = await request(app)
        .post("/api/tables/t1/action")
        .send({ actionType: "FOLD" });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it("should return error for invalid action", async () => {
      vi.mocked(gameClient.SubmitAction).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: false, error: "NOT_YOUR_TURN" });
        }
      );

      const response = await request(app)
        .post("/api/tables/t1/action")
        .send({ actionType: "FOLD" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("NOT_YOUR_TURN");
    });
  });

  describe("POST /api/tables/:tableId/spectate", () => {
    it("should join as spectator", async () => {
      vi.mocked(gameClient.JoinSpectator).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        }
      );

      const response = await request(app).post("/api/tables/t1/spectate");

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });
  });
});
