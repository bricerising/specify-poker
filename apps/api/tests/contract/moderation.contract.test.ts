import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server";
import { resetTables } from "../../src/services/tableRegistry";
import { resetModeration } from "../../src/services/moderationService";
import { resetTableStates } from "../../src/services/tableState";

const secret = "test-secret";

function signToken(userId: string) {
  return jwt.sign(
    { sub: userId, preferred_username: userId },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

describe("moderation contract", () => {
  it("creates tables and allows owner moderation actions", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetTables();
    resetTableStates();
    resetModeration();

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const ownerToken = signToken("owner-1");
    const targetToken = signToken("user-2");

    const createResponse = await request(server)
      .post("/api/tables")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Moderation Table",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 4,
          startingStack: 200,
        },
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: "Moderation Table",
      ownerId: "owner-1",
      seatsTaken: 0,
      inProgress: false,
    });

    const tableId = createResponse.body.tableId as string;

    const joinResponse = await request(server)
      .post(`/api/tables/${tableId}/join`)
      .set("Authorization", `Bearer ${targetToken}`)
      .send({ seatId: 0 });

    expect(joinResponse.status).toBe(200);

    const muteResponse = await request(server)
      .post(`/api/tables/${tableId}/moderation/mute`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ seatId: 0 });

    expect(muteResponse.status).toBe(200);
    expect(muteResponse.body).toMatchObject({
      tableId,
      seatId: 0,
      userId: "user-2",
      action: "mute",
    });

    const kickResponse = await request(server)
      .post(`/api/tables/${tableId}/moderation/kick`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ seatId: 0 });

    expect(kickResponse.status).toBe(200);
    expect(kickResponse.body).toMatchObject({
      tableId,
      seatId: 0,
      userId: "user-2",
      action: "kick",
    });

    server.close();
  });
});
