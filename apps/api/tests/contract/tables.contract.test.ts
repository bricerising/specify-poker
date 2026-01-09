import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import request from "supertest";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { getTableState, resetTableStates } from "../../src/services/tableState";

const secret = "test-secret";

function signToken(userId = "user-123") {
  return jwt.sign(
    {
      sub: userId,
      preferred_username: "Tester",
    },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

describe("tables contract", () => {
  it("lists tables and returns join payload with wsUrl", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await resetTables();
    await resetTableStates();
    const summary = await createTable({
      name: "Contract Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        startingStack: 500,
        bettingStructure: "NoLimit",
      },
    });

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const token = signToken();

    const listResponse = await request(server)
      .get("/api/tables")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body[0]).toMatchObject({
      tableId: summary.tableId,
      name: "Contract Table",
      seatsTaken: 0,
      inProgress: false,
    });

    const joinResponse = await request(server)
      .post(`/api/tables/${summary.tableId}/join`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seatId: 0 });

    expect(joinResponse.status).toBe(200);
    expect(joinResponse.body).toMatchObject({
      tableId: summary.tableId,
      seatId: 0,
    });
    expect(joinResponse.body.wsUrl).toContain("/ws");

    server.close();
  });

  it("emits TableSnapshot on subscribe", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await resetTables();
    await resetTableStates();
    const summary = await createTable({
      name: "Snapshot Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        startingStack: 500,
        bettingStructure: "NoLimit",
      },
    });

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const token = signToken();

    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
    const snapshot = await new Promise<{ type: string; tableState: unknown }>((resolve, reject) => {
      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "TableSnapshot") {
          resolve(message);
        }
      });
      ws.on("error", reject);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
      });
    });

    expect(snapshot.type).toBe("TableSnapshot");
    const state = snapshot.tableState as { tableId?: string };
    expect(state.tableId).toBe(summary.tableId);
    expect(await getTableState(summary.tableId)).not.toBeNull();

    ws.close();
    server.close();
  });
});
