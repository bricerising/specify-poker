import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { resetModeration } from "../../src/services/moderationService";
import { resetTableStates } from "../../src/services/tableState";
import { joinSeat } from "../../src/services/tableService";

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

describe("ws chat hub", () => {
  it("broadcasts chat messages to table subscribers", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await resetTables();
    await resetTableStates();
    await resetModeration();

    const summary = await createTable({
      name: "Chat Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 4,
        startingStack: 200,
        bettingStructure: "NoLimit",
      },
    });

    await joinSeat({ tableId: summary.tableId, seatId: 0, userId: "user-a" });
    await joinSeat({ tableId: summary.tableId, seatId: 1, userId: "user-b" });

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const tokenA = signToken("user-a");
    const tokenB = signToken("user-b");

    const wsA = new WebSocket(`ws://localhost:${port}/ws?token=${tokenA}`);
    const wsB = new WebSocket(`ws://localhost:${port}/ws?token=${tokenB}`);

    await Promise.all([
      new Promise<void>((resolve) => wsA.on("open", () => resolve())),
      new Promise<void>((resolve) => wsB.on("open", () => resolve())),
    ]);

    const waitForSubscribed = (ws: WebSocket) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("chat subscribe timeout")), 2000);
        ws.on("message", function handleMessage(data) {
          const message = JSON.parse(data.toString());
          if (message.type === "ChatSubscribed") {
            clearTimeout(timeout);
            ws.off("message", handleMessage);
            resolve();
          }
        });
      });

    wsA.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));
    wsB.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));

    await Promise.all([waitForSubscribed(wsA), waitForSubscribed(wsB)]);

    const messagePromise = new Promise<{ message: { text: string; userId: string } }>((resolve) => {
      wsB.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "ChatMessage") {
          resolve(message);
        }
      });
    });

    wsA.send(JSON.stringify({ type: "ChatSend", tableId: summary.tableId, message: "hello table" }));

    const received = await messagePromise;
    expect(received.message.text).toBe("hello table");
    expect(received.message.userId).toBe("user-a");

    wsA.close();
    wsB.close();
    server.close();
  });
});
