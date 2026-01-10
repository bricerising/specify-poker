import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import request from "supertest";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { resetTableStates } from "../../src/services/tableState";

const secret = "test-secret";

function signToken(userId: string) {
  return jwt.sign(
    { sub: userId },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

type TablePatch = {
  type: string;
  patch: {
    hand: { currentStreet: string };
    seats: { status: string }[];
  };
};

describe("turn timer", () => {
  it("auto-folds when turn timer expires", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";
    process.env.TURN_TIMER_MS = "20";

    await resetTables();
    await resetTableStates();
    const summary = await createTable({
      name: "Timer Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 2,
        startingStack: 100,
        bettingStructure: "NoLimit",
      },
    });

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const tokenA = signToken("user-a");
    const tokenB = signToken("user-b");

    await request(server)
      .post(`/api/tables/${summary.tableId}/join`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ seatId: 0 });

    await request(server)
      .post(`/api/tables/${summary.tableId}/join`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ seatId: 1 });

    const wsA = new WebSocket(`ws://localhost:${port}/ws?token=${tokenA}`);
    await new Promise<void>((resolve) => wsA.on("open", () => resolve()));
    wsA.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));

    const patch = await new Promise<TablePatch>((resolve) => {
      wsA.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "TablePatch") {
          resolve(message);
        }
      });
    });

    expect(patch.patch.hand.currentStreet).toBe("preflop");
    expect(patch.patch.seats[0].status).toBe("active");

    wsA.close();
    server.close();
  });
});
