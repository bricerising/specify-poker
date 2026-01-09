import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
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

describe("ws resync", () => {
  it("responds with a table snapshot on resync request", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetTables();
    resetTableStates();

    const summary = createTable({
      name: "Resync Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 4,
        startingStack: 200,
        bettingStructure: "NoLimit",
      },
    });

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const token = signToken("user-a");
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);

    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    let snapshots = 0;
    const snapshotPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("snapshot timeout")), 2000);
      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "TableSnapshot") {
          snapshots += 1;
          if (snapshots === 2) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });
    });

    ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
    ws.send(JSON.stringify({ type: "ResyncTable", tableId: summary.tableId }));

    await snapshotPromise;
    expect(snapshots).toBe(2);

    ws.close();
    server.close();
  });
});
