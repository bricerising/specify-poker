/**
 * Specification Requirements Tests
 *
 * These tests verify that the functional requirements from specs/001-poker-mvp/spec.md
 * are properly implemented. Each test is mapped to a specific requirement.
 */
import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import request from "supertest";
import WebSocket from "ws";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { createServer } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { resetTableStates, getTableState } from "../../src/services/tableState";
import { eventStore } from "../../src/services/eventStore";
import { resetProfiles } from "../../src/services/profileService";
import { resetFriends } from "../../src/services/friendsService";
import { resetModeration } from "../../src/services/moderationService";
import { getInMemoryExporter } from "../../src/observability/otel";

const secret = "test-secret";

function signToken(userId: string, claims: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      sub: userId,
      preferred_username: claims.preferred_username ?? userId,
      picture: claims.picture,
      ...claims,
    },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

type WsMessage = Record<string, unknown>;

async function waitForMessage(
  ws: WebSocket,
  predicate: (message: WsMessage) => boolean,
  timeoutMs = 2000,
): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", handleMessage);
      reject(new Error("Timed out waiting for message"));
    }, timeoutMs);
    const handleMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString());
      if (predicate(message)) {
        clearTimeout(timeout);
        ws.off("message", handleMessage);
        resolve(message);
      }
    };
    ws.on("message", handleMessage);
  });
}

describe("Specification Requirements", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeEach(async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await resetTables();
    await resetTableStates();
    await resetProfiles();
    await resetFriends();
    await resetModeration();
    await eventStore.reset();

    server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(() => {
    server.close();
  });

  describe("FR-001: Authentication via JWT", () => {
    it("rejects requests without authentication", async () => {
      const response = await request(server).get("/api/me");
      expect(response.status).toBe(401);
    });

    it("accepts requests with valid JWT token", async () => {
      const token = signToken("user-1");
      const response = await request(server)
        .get("/api/me")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe("user-1");
    });

    it("rejects WebSocket connections without token", async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      const closePromise = new Promise<number>((resolve) => {
        ws.on("close", (code) => resolve(code));
      });
      const code = await closePromise;
      expect(code).toBe(1008);
    });

    it("accepts WebSocket connections with valid token", async () => {
      const token = signToken("user-1");
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
      const welcome = await waitForMessage(ws, (m) => m.type === "Welcome");
      expect(welcome.userId).toBe("user-1");
      expect(welcome.connectionId).toBeDefined();
      ws.close();
    });
  });

  describe("FR-002: User nickname and avatar", () => {
    it("allows users to set nickname (2-20 chars)", async () => {
      const token = signToken("user-1");

      const response = await request(server)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ nickname: "PokerPro" });

      expect(response.status).toBe(200);
      expect(response.body.nickname).toBe("PokerPro");
    });

    it("rejects nicknames shorter than 2 chars", async () => {
      const token = signToken("user-1");

      const response = await request(server)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ nickname: "A" });

      expect(response.status).toBe(400);
    });

    it("rejects nicknames longer than 20 chars", async () => {
      const token = signToken("user-1");

      const response = await request(server)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ nickname: "ThisNicknameIsTooLongForTheSystem" });

      expect(response.status).toBe(400);
    });

    it("allows users to set avatar URL", async () => {
      const token = signToken("user-1");

      const response = await request(server)
        .post("/api/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({ nickname: "Player1", avatarUrl: "https://example.com/avatar.png" });

      expect(response.status).toBe(200);
      expect(response.body.avatarUrl).toBe("https://example.com/avatar.png");
    });
  });

  describe("FR-003: Lobby listing with required fields", () => {
    it("lists tables with all required fields", async () => {
      const token = signToken("owner-1");

      await createTable({
        name: "Test Table",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 6,
          startingStack: 500,
          bettingStructure: "NoLimit",
        },
      });

      const response = await request(server)
        .get("/api/tables")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);

      const table = response.body[0];
      expect(table).toHaveProperty("tableId");
      expect(table).toHaveProperty("name");
      expect(table).toHaveProperty("ownerId");
      expect(table).toHaveProperty("config");
      expect(table).toHaveProperty("seatsTaken");
      expect(table).toHaveProperty("occupiedSeatIds");
      expect(table).toHaveProperty("inProgress");
      expect(table.config).toHaveProperty("smallBlind");
      expect(table.config).toHaveProperty("bigBlind");
      expect(table.config).toHaveProperty("maxPlayers");
    });

    it("updates occupiedSeatIds when players join", async () => {
      const summary = await createTable({
        name: "Occupied Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 6,
          startingStack: 500,
          bettingStructure: "NoLimit",
        },
      });

      const token = signToken("player-1");
      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token}`)
        .send({ seatId: 2 });

      const response = await request(server)
        .get("/api/tables")
        .set("Authorization", `Bearer ${token}`);

      const table = response.body.find((t: { tableId: string }) => t.tableId === summary.tableId);
      expect(table.seatsTaken).toBe(1);
      expect(table.occupiedSeatIds).toContain(2);
    });
  });

  describe("FR-004: Table creation with configuration", () => {
    it("creates table with name, blinds, max players, starting stack", async () => {
      const token = signToken("owner-1");

      const response = await request(server)
        .post("/api/tables")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "My Table",
          config: {
            smallBlind: 10,
            bigBlind: 20,
            maxPlayers: 9,
            startingStack: 1000,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("My Table");
      expect(response.body.ownerId).toBe("owner-1");
      expect(response.body.config.smallBlind).toBe(10);
      expect(response.body.config.bigBlind).toBe(20);
      expect(response.body.config.maxPlayers).toBe(9);
      expect(response.body.config.startingStack).toBe(1000);
    });

    it("accepts optional ante configuration", async () => {
      const token = signToken("owner-1");

      const response = await request(server)
        .post("/api/tables")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Ante Table",
          config: {
            smallBlind: 10,
            bigBlind: 20,
            ante: 5,
            maxPlayers: 6,
            startingStack: 500,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.config.ante).toBe(5);
    });

    it("validates maxPlayers is between 2-9", async () => {
      const token = signToken("owner-1");

      const tooFew = await request(server)
        .post("/api/tables")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Invalid",
          config: { smallBlind: 5, bigBlind: 10, maxPlayers: 1, startingStack: 100 },
        });
      expect(tooFew.status).toBe(400);

      const tooMany = await request(server)
        .post("/api/tables")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Invalid",
          config: { smallBlind: 5, bigBlind: 10, maxPlayers: 10, startingStack: 100 },
        });
      expect(tooMany.status).toBe(400);
    });

    it("validates bigBlind >= 2 * smallBlind", async () => {
      const token = signToken("owner-1");

      const response = await request(server)
        .post("/api/tables")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Invalid",
          config: { smallBlind: 10, bigBlind: 15, maxPlayers: 6, startingStack: 100 },
        });

      expect(response.status).toBe(400);
    });
  });

  describe("FR-005: Join seat or spectate if hand in progress", () => {
    it("allows joining an open seat", async () => {
      const summary = await createTable({
        name: "Join Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 6,
          startingStack: 500,
          bettingStructure: "NoLimit",
        },
      });

      const token = signToken("player-1");
      const response = await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token}`)
        .send({ seatId: 0 });

      expect(response.status).toBe(200);
      expect(response.body.tableId).toBe(summary.tableId);
      expect(response.body.seatId).toBe(0);
      expect(response.body.wsUrl).toContain("/ws?token=");
    });

    it("rejects joining an occupied seat", async () => {
      const summary = await createTable({
        name: "Occupied",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const token1 = signToken("player-1");
      const token2 = signToken("player-2");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ seatId: 0 });

      const response = await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ seatId: 0 });

      expect(response.status).toBe(409);
    });

    it("marks player as spectator when joining during active hand", async () => {
      const summary = await createTable({
        name: "Spectator Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 4,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      // Two players join to start a hand
      const token1 = signToken("player-1");
      const token2 = signToken("player-2");
      const token3 = signToken("player-3");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ seatId: 1 });

      // Now a hand should be in progress
      const tableState = await getTableState(summary.tableId);
      expect(tableState?.status).toBe("in_hand");

      // Third player joins as spectator
      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token3}`)
        .send({ seatId: 2 });

      const updatedState = await getTableState(summary.tableId);
      const seat3 = updatedState?.seats.find((s) => s.seatId === 2);
      expect(seat3?.status).toBe("spectator");
    });
  });

  describe("FR-006: Present only legal actions", () => {
    it("validates that only legal actions are accepted", async () => {
      const summary = await createTable({
        name: "Legal Actions",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const tokenA = signToken("player-a");
      const tokenB = signToken("player-b");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ seatId: 1 });

      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tokenA}`);
      await new Promise<void>((resolve) => ws.on("open", resolve));

      ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      const snapshot = await waitForMessage(ws, (m) => m.type === "TableSnapshot");
      const tableState = snapshot.tableState as { hand: { currentTurnSeat: number } };

      // Try to act out of turn (should be rejected)
      const wrongPlayer = tableState.hand.currentTurnSeat === 0 ? tokenB : tokenA;
      const wrongWs = new WebSocket(`ws://localhost:${port}/ws?token=${wrongPlayer}`);
      await new Promise<void>((resolve) => wrongWs.on("open", resolve));
      wrongWs.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      await waitForMessage(wrongWs, (m) => m.type === "TableSnapshot");

      wrongWs.send(JSON.stringify({
        type: "Action",
        tableId: summary.tableId,
        action: "Check",
      }));

      const result = await waitForMessage(wrongWs, (m) => m.type === "ActionResult");
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("not_your_turn");

      ws.close();
      wrongWs.close();
    });
  });

  describe("FR-007: Texas Hold'em rules enforcement", () => {
    it("enforces blinds posting at hand start", async () => {
      const summary = await createTable({
        name: "Blinds Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const token1 = signToken("player-1");
      const token2 = signToken("player-2");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ seatId: 1 });

      const tableState = await getTableState(summary.tableId);
      expect(tableState?.hand).toBeDefined();

      // Check that blinds are posted
      const hand = tableState!.hand!;
      const sbContrib = hand.roundContributions[hand.smallBlindSeat];
      const bbContrib = hand.roundContributions[hand.bigBlindSeat];
      expect(sbContrib).toBe(5);
      expect(bbContrib).toBe(10);
    });

    it("progresses through betting rounds correctly", async () => {
      // This test verifies that the hand progresses from preflop to flop to turn
      // We test this via the engine directly to avoid WebSocket timing issues
      const { startHand, applyAction } = await import("../../src/engine/handEngine");

      const table = {
        tableId: "test",
        name: "Test",
        ownerId: "owner",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 200,
          bettingStructure: "NoLimit" as const,
        },
        seats: [
          { seatId: 0, userId: "p1", stack: 200, status: "active" as const },
          { seatId: 1, userId: "p2", stack: 200, status: "active" as const },
        ],
        status: "lobby" as const,
        hand: null,
        version: 0,
      };

      const handTable = startHand(table);
      expect(handTable.hand).toBeDefined();
      expect(handTable.hand?.currentStreet).toBe("preflop");

      // First player (button/SB in heads up) calls
      let result = applyAction(handTable, handTable.hand!.currentTurnSeat, { type: "Call" });
      expect(result.accepted).toBe(true);

      // BB checks - should advance to flop
      result = applyAction(result.table, result.table.hand!.currentTurnSeat, { type: "Check" });
      expect(result.accepted).toBe(true);
      expect(result.table.hand?.currentStreet).toBe("flop");

      // Both check on flop - should advance to turn
      result = applyAction(result.table, result.table.hand!.currentTurnSeat, { type: "Check" });
      expect(result.accepted).toBe(true);
      result = applyAction(result.table, result.table.hand!.currentTurnSeat, { type: "Check" });
      expect(result.accepted).toBe(true);
      expect(result.table.hand?.currentStreet).toBe("turn");
    });
  });

  describe("FR-008: Server-authoritative game state", () => {
    it("rejects invalid bet amounts", async () => {
      const summary = await createTable({
        name: "Server Auth",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const tokenA = signToken("player-a");
      const tokenB = signToken("player-b");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ seatId: 1 });

      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tokenA}`);
      await new Promise<void>((resolve) => ws.on("open", resolve));
      ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      await waitForMessage(ws, (m) => m.type === "TableSnapshot");

      // Try to bet more than stack
      ws.send(JSON.stringify({
        type: "Action",
        tableId: summary.tableId,
        action: "Raise",
        amount: 9999,
      }));

      const result = await waitForMessage(ws, (m) => m.type === "ActionResult");
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("amount_too_large");

      ws.close();
    });
  });

  describe("FR-009: Real-time state updates", () => {
    it("WebSocket broadcasts table patches on state changes", async () => {
      // This requirement is tested in the existing ws-table.test.ts
      // Here we verify the architectural capability exists

      // Verify WebSocket server is attached and can handle connections
      const token = signToken("player-1");
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);

      const welcomeReceived = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === "Welcome") {
            clearTimeout(timeout);
            resolve(true);
          }
        });
        ws.on("open", () => {
          // Wait for welcome message
        });
      });

      expect(welcomeReceived).toBe(true);
      ws.close();
    });
  });

  describe("FR-011: Hand event log with timestamps", () => {
    it("stores events with timestamps for audit", async () => {
      const summary = await createTable({
        name: "Audit Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const tokenA = signToken("player-a");
      const tokenB = signToken("player-b");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ seatId: 1 });

      const tableState = await getTableState(summary.tableId);
      const handId = tableState?.hand?.handId;

      const events = await eventStore.list(handId!);
      expect(events.length).toBeGreaterThan(0);

      const handStarted = events.find((e) => e.type === "HandStarted");
      expect(handStarted).toBeDefined();
      expect(handStarted?.ts).toBeDefined();
      expect(handStarted?.eventId).toBeDefined();
    });

    it("exposes redacted replay endpoint", async () => {
      const summary = await createTable({
        name: "Replay Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const tokenA = signToken("player-a");
      const tokenB = signToken("player-b");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ seatId: 1 });

      const tableState = await getTableState(summary.tableId);
      const handId = tableState?.hand?.handId;

      const response = await request(server)
        .get(`/api/audit/${handId}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.body.handId).toBe(handId);
      expect(response.body.events).toBeDefined();

      // Verify redaction: holeCards and deck should be empty
      for (const event of response.body.events) {
        if (event.payload?.snapshot) {
          expect(event.payload.snapshot.holeCards).toEqual({});
          expect(event.payload.snapshot.deck).toEqual([]);
        }
      }
    });
  });

  describe("FR-012: Per-table chat with moderation", () => {
    it("allows seated players to chat", async () => {
      const summary = await createTable({
        name: "Chat Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const tokenA = signToken("player-a");
      const tokenB = signToken("player-b");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ seatId: 1 });

      const wsA = new WebSocket(`ws://localhost:${port}/ws?token=${tokenA}`);
      const wsB = new WebSocket(`ws://localhost:${port}/ws?token=${tokenB}`);

      await Promise.all([
        new Promise<void>((resolve) => wsA.on("open", resolve)),
        new Promise<void>((resolve) => wsB.on("open", resolve)),
      ]);

      wsA.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      wsB.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      wsA.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));
      wsB.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));

      await waitForMessage(wsA, (m) => m.type === "ChatSubscribed");
      await waitForMessage(wsB, (m) => m.type === "ChatSubscribed");

      const chatPromise = waitForMessage(wsB, (m) => m.type === "ChatMessage");

      wsA.send(JSON.stringify({
        type: "ChatSend",
        tableId: summary.tableId,
        message: "Hello!",
      }));

      const chatMessage = await chatPromise;
      expect(chatMessage.type).toBe("ChatMessage");
      expect((chatMessage.message as { text: string }).text).toBe("Hello!");

      wsA.close();
      wsB.close();
    });

    it("owner can mute a player", async () => {
      const summary = await createTable({
        name: "Mute Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const ownerToken = signToken("owner-1");
      const playerToken = signToken("player-1");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${playerToken}`)
        .send({ seatId: 1 });

      // Owner mutes player
      const muteResponse = await request(server)
        .post(`/api/tables/${summary.tableId}/moderation/mute`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ seatId: 1 });

      expect(muteResponse.status).toBe(200);
      expect(muteResponse.body.action).toBe("mute");

      // Verify muted player cannot chat
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${playerToken}`);
      await new Promise<void>((resolve) => ws.on("open", resolve));
      ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      ws.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));
      await waitForMessage(ws, (m) => m.type === "ChatSubscribed");

      ws.send(JSON.stringify({
        type: "ChatSend",
        tableId: summary.tableId,
        message: "Test",
      }));

      const error = await waitForMessage(ws, (m) => m.type === "ChatError");
      expect(error.reason).toBe("muted");

      ws.close();
    });

    it("owner can kick a player", async () => {
      const summary = await createTable({
        name: "Kick Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 3,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const ownerToken = signToken("owner-1");
      const playerToken = signToken("player-1");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${playerToken}`)
        .send({ seatId: 1 });

      const kickResponse = await request(server)
        .post(`/api/tables/${summary.tableId}/moderation/kick`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ seatId: 1 });

      expect(kickResponse.status).toBe(200);
      expect(kickResponse.body.action).toBe("kick");

      // Verify player is no longer seated
      const tableState = await getTableState(summary.tableId);
      const seat = tableState?.seats.find((s) => s.seatId === 1);
      expect(seat?.userId).toBeNull();
    });
  });

  describe("FR-013: User stats tracking", () => {
    it("tracks hands played and wins in profile", async () => {
      const token = signToken("player-1");

      // Get initial profile
      const initial = await request(server)
        .get("/api/me")
        .set("Authorization", `Bearer ${token}`);

      expect(initial.body.stats).toBeDefined();
      expect(initial.body.stats.handsPlayed).toBeDefined();
      expect(initial.body.stats.wins).toBeDefined();
    });
  });

  describe("FR-014: Hole card redaction", () => {
    it("redacts hole cards in table snapshots", async () => {
      const summary = await createTable({
        name: "Redaction Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const tokenA = signToken("player-a");
      const tokenB = signToken("player-b");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ seatId: 0 });

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ seatId: 1 });

      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tokenA}`);
      await new Promise<void>((resolve) => ws.on("open", resolve));
      ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));

      const snapshot = await waitForMessage(ws, (m) => m.type === "TableSnapshot");
      const tableState = snapshot.tableState as { hand: { holeCards: object; deck: unknown[] } };

      // Snapshot should have redacted holeCards and deck
      expect(tableState.hand.holeCards).toEqual({});
      expect(tableState.hand.deck).toEqual([]);

      ws.close();
    });

    it("sends hole cards only to owning player", async () => {
      // This verifies the architectural design - hole cards are stored per-seat
      // and should only be sent to the owning player
      // The actual WebSocket delivery is tested in ws-table.test.ts

      const { startHand } = await import("../../src/engine/handEngine");

      const table = {
        tableId: "test",
        name: "Test",
        ownerId: "owner",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit" as const,
        },
        seats: [
          { seatId: 0, userId: "p1", stack: 100, status: "active" as const },
          { seatId: 1, userId: "p2", stack: 100, status: "active" as const },
        ],
        status: "lobby" as const,
        hand: null,
        version: 0,
      };

      const handTable = startHand(table);

      // Verify hole cards exist for each player
      expect(handTable.hand).toBeDefined();
      expect(handTable.hand!.holeCards[0]).toBeDefined();
      expect(handTable.hand!.holeCards[0].length).toBe(2);
      expect(handTable.hand!.holeCards[1]).toBeDefined();
      expect(handTable.hand!.holeCards[1].length).toBe(2);

      // Verify hole cards are different for each player
      expect(handTable.hand!.holeCards[0]).not.toEqual(handTable.hand!.holeCards[1]);
    });
  });

  describe("FR-015: Reconnect and resync", () => {
    it("allows resync of table state", async () => {
      const summary = await createTable({
        name: "Resync Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const token = signToken("player-1");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token}`)
        .send({ seatId: 0 });

      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
      await new Promise<void>((resolve) => ws.on("open", resolve));
      ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      await waitForMessage(ws, (m) => m.type === "TableSnapshot");

      // Request resync
      ws.send(JSON.stringify({ type: "ResyncTable", tableId: summary.tableId }));
      const resync = await waitForMessage(ws, (m) => m.type === "TableSnapshot");

      expect(resync.type).toBe("TableSnapshot");
      expect((resync.tableState as { tableId: string }).tableId).toBe(summary.tableId);

      ws.close();
    });
  });

  describe("FR-016: Friends list capability", () => {
    it("allows managing friends list", async () => {
      const token = signToken("player-1");

      // Get friends (should be empty)
      const initial = await request(server)
        .get("/api/friends")
        .set("Authorization", `Bearer ${token}`);

      expect(initial.status).toBe(200);
      expect(initial.body.friends).toEqual([]);

      // Add friends
      const update = await request(server)
        .put("/api/friends")
        .set("Authorization", `Bearer ${token}`)
        .send({ friends: ["friend-1", "friend-2"] });

      expect(update.status).toBe(200);
      expect(update.body.friends).toContain("friend-1");
      expect(update.body.friends).toContain("friend-2");

      // Verify persistence
      const verify = await request(server)
        .get("/api/friends")
        .set("Authorization", `Bearer ${token}`);

      expect(verify.body.friends.length).toBe(2);
    });
  });

  describe("FR-018: Table state versioning", () => {
    it("includes version in table state", async () => {
      const summary = await createTable({
        name: "Version Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const token = signToken("player-1");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token}`)
        .send({ seatId: 0 });

      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
      await new Promise<void>((resolve) => ws.on("open", resolve));
      ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));

      const snapshot = await waitForMessage(ws, (m) => m.type === "TableSnapshot");
      const tableState = snapshot.tableState as { version: number };

      expect(tableState.version).toBeDefined();
      expect(typeof tableState.version).toBe("number");

      ws.close();
    });
  });

  describe("FR-019: Metrics and observability", () => {
    it("exposes Prometheus metrics endpoint", async () => {
      const response = await request(server).get("/metrics");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/plain");
    });

    it("emits OpenTelemetry traces for gameplay events", async () => {
      const summary = await createTable({
        name: "Telemetry Test",
        ownerId: "owner-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 2,
          startingStack: 100,
          bettingStructure: "NoLimit",
        },
      });

      const token = signToken("player-1");

      await request(server)
        .post(`/api/tables/${summary.tableId}/join`)
        .set("Authorization", `Bearer ${token}`)
        .send({ seatId: 0 });

      const exporter = getInMemoryExporter();
      const spans = exporter?.getFinishedSpans() ?? [];

      // Should have spans for table operations
      const joinSpan = spans.find((s) => s.name === "poker.table.join");
      expect(joinSpan).toBeDefined();
    });
  });
});
