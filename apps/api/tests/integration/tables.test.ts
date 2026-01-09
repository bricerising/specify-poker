import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { resetTableStates } from "../../src/services/tableState";

const secret = "test-secret";

function signToken(userId = "user-123") {
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

describe("tables endpoints", () => {
  it("joins and leaves a seat", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await resetTables();
    await resetTableStates();
    const summary = await createTable({
      name: "Join Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 2,
        startingStack: 100,
        bettingStructure: "NoLimit",
      },
    });

    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken();

    const joinResponse = await request(app)
      .post(`/api/tables/${summary.tableId}/join`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seatId: 0 });

    expect(joinResponse.status).toBe(200);

    const leaveResponse = await request(app)
      .post(`/api/tables/${summary.tableId}/leave`)
      .set("Authorization", `Bearer ${token}`);

    expect(leaveResponse.status).toBe(204);
  });
});
