import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import auditRouter from "../../../src/http/routes/audit";

// Mock the gRPC client
vi.mock("../../../src/grpc/clients", () => ({
  eventClient: {
    QueryEvents: vi.fn(),
    GetEvent: vi.fn(),
    GetHandRecord: vi.fn(),
    GetHandReplay: vi.fn(),
    GetHandHistory: vi.fn(),
    GetHandsForUser: vi.fn(),
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

import { eventClient } from "../../../src/grpc/clients";

describe("Audit Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Add mock auth middleware
    app.use((req, _res, next) => {
      (req as any).auth = { userId: "user-123", claims: {} };
      next();
    });
    app.use("/api/audit", auditRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/audit/events", () => {
    it("should return queried events", async () => {
      const mockEvents = [
        { event_id: "e1", type: "HAND_STARTED" },
        { event_id: "e2", type: "ACTION_TAKEN" },
      ];

      vi.mocked(eventClient.QueryEvents).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {
            events: mockEvents,
            total: 2,
            has_more: false,
          });
        }
      );

      const response = await request(app).get("/api/audit/events");

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual(mockEvents);
      expect(response.body.total).toBe(2);
      expect(response.body.hasMore).toBe(false);
    });

    it("should pass query parameters", async () => {
      vi.mocked(eventClient.QueryEvents).mockImplementation(
        (req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { events: [], total: 0, has_more: false });
        }
      );

      await request(app).get("/api/audit/events?tableId=t1&limit=10");

      expect(eventClient.QueryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          table_id: "t1",
          limit: 10,
        }),
        expect.any(Function)
      );
    });
  });

  describe("GET /api/audit/events/:eventId", () => {
    it("should return single event", async () => {
      const mockEvent = { event_id: "e1", type: "HAND_STARTED" };

      vi.mocked(eventClient.GetEvent).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockEvent);
        }
      );

      const response = await request(app).get("/api/audit/events/e1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockEvent);
    });

    it("should return 404 for non-existent event", async () => {
      vi.mocked(eventClient.GetEvent).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error("Not found"), null);
        }
      );

      const response = await request(app).get("/api/audit/events/not-found");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/audit/hands/:handId", () => {
    it("should return hand record", async () => {
      const mockHand = {
        hand_id: "h1",
        table_id: "t1",
        participants: [],
      };

      vi.mocked(eventClient.GetHandRecord).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockHand);
        }
      );

      const response = await request(app).get("/api/audit/hands/h1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHand);
    });
  });

  describe("GET /api/audit/hands/:handId/replay", () => {
    it("should return hand replay", async () => {
      const mockReplay = {
        hand_id: "h1",
        events: [
          { event_id: "e1", type: "HAND_STARTED" },
          { event_id: "e2", type: "ACTION_TAKEN" },
        ],
      };

      vi.mocked(eventClient.GetHandReplay).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockReplay);
        }
      );

      const response = await request(app).get("/api/audit/hands/h1/replay");

      expect(response.status).toBe(200);
      expect(response.body.handId).toBe("h1");
      expect(response.body.events).toHaveLength(2);
    });
  });

  describe("GET /api/audit/tables/:tableId/hands", () => {
    it("should return hand history for table", async () => {
      const mockHands = [
        { hand_id: "h1", table_id: "t1" },
        { hand_id: "h2", table_id: "t1" },
      ];

      vi.mocked(eventClient.GetHandHistory).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { hands: mockHands, total: 2 });
        }
      );

      const response = await request(app).get("/api/audit/tables/t1/hands");

      expect(response.status).toBe(200);
      expect(response.body.hands).toEqual(mockHands);
      expect(response.body.total).toBe(2);
    });
  });

  describe("GET /api/audit/my-hands", () => {
    it("should return current user hand history", async () => {
      const mockHands = [
        { hand_id: "h1", table_id: "t1" },
      ];

      vi.mocked(eventClient.GetHandsForUser).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { hands: mockHands, total: 1 });
        }
      );

      const response = await request(app).get("/api/audit/my-hands");

      expect(response.status).toBe(200);
      expect(response.body.hands).toEqual(mockHands);
    });
  });

  describe("GET /api/audit/users/:userId/hands", () => {
    it("should return own hand history", async () => {
      const mockHands = [
        { hand_id: "h1", table_id: "t1" },
      ];

      vi.mocked(eventClient.GetHandsForUser).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { hands: mockHands, total: 1 });
        }
      );

      const response = await request(app).get("/api/audit/users/user-123/hands");

      expect(response.status).toBe(200);
      expect(response.body.hands).toEqual(mockHands);
    });

    it("should return 403 when accessing other user hands", async () => {
      const response = await request(app).get("/api/audit/users/other-user/hands");

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Forbidden");
    });
  });
});
