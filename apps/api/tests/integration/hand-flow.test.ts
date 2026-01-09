import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import request from "supertest";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";

import { getInMemoryExporter } from "../../src/observability/otel";
import { createServer } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { resetTableStates } from "../../src/services/tableState";

const secret = "test-secret";

function signToken(userId: string) {
  return jwt.sign(
    {
      sub: userId,
      preferred_username: userId,
    },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

type TableMessage = {
  type: string;
  tableState?: {
    tableId: string;
    hand: {
      handId: string;
      currentStreet: string;
      communityCards: string[];
      currentTurnSeat: number;
      currentBet: number;
      roundContributions: Record<number, number>;
    } | null;
  };
};

async function waitForMessage(
  ws: WebSocket,
  predicate: (message: TableMessage) => boolean,
  timeoutMs = 1000,
) {
  return new Promise<TableMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", handleMessage);
      ws.off("error", handleError);
      reject(new Error("Timed out waiting for message"));
    }, timeoutMs);
    const handleMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString());
      if (predicate(message)) {
        clearTimeout(timeout);
        ws.off("message", handleMessage);
        ws.off("error", handleError);
        resolve(message);
      }
    };
    const handleError = (error: Error) => {
      clearTimeout(timeout);
      ws.off("message", handleMessage);
      ws.off("error", handleError);
      reject(error);
    };
    ws.on("message", handleMessage);
    ws.on("error", handleError);
  });
}

describe("hand flow", () => {
  it("plays a full hand through showdown", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await resetTables();
    await resetTableStates();
    const summary = await createTable({
      name: "Hand Flow",
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
    const wsB = new WebSocket(`ws://localhost:${port}/ws?token=${tokenB}`);

    await Promise.all([
      new Promise<void>((resolve) => wsA.on("open", () => resolve())),
      new Promise<void>((resolve) => wsB.on("open", () => resolve())),
    ]);

    wsA.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
    wsB.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));

    let tableState = (await waitForMessage(wsA, (message) => message.type === "TableSnapshot"))
      .tableState;
    const initialHandId = tableState?.hand?.handId;

    expect(tableState?.hand?.currentStreet).toBe("preflop");

    const sendAction = (ws: WebSocket, action: string, amount?: number) => {
      ws.send(
        JSON.stringify({
          type: "Action",
          tableId: summary.tableId,
          handId: tableState?.hand?.handId,
          action,
          amount,
        }),
      );
    };

    const playHand = async () => {
      let guard = 0;
      while (tableState?.hand && tableState.hand.handId === initialHandId) {
        if (guard > 20) {
          throw new Error("hand did not complete");
        }
        const hand = tableState.hand;
        const seatId = hand.currentTurnSeat;
        const toCall = Math.max(0, hand.currentBet - (hand.roundContributions[seatId] ?? 0));
        const action = toCall > 0 ? "Call" : "Check";
        const nextPatch = waitForMessage(wsA, (message) => message.type === "TablePatch");
        if (seatId === 0) {
          sendAction(wsA, action);
        } else {
          sendAction(wsB, action);
        }
        tableState = (await nextPatch).tableState;
        guard += 1;
      }
    };

    await playHand();

    expect(tableState?.hand?.handId).not.toBe(initialHandId);
    expect(tableState?.hand?.currentStreet).toBe("preflop");

    wsA.close();
    wsB.close();
    server.close();

    const spans = getInMemoryExporter()?.getFinishedSpans() ?? [];
    const lifecycleSpans = spans.filter((span) => span.name === "poker.hand.transition");
    expect(lifecycleSpans.length).toBeGreaterThan(0);
  }, 15000);
});
