import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { createTable, resetTables } from "../../src/services/tableRegistry";
import { resetModeration } from "../../src/services/moderationService";
import { getTableState, resetTableStates } from "../../src/services/tableState";

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

describe("moderation endpoints", () => {
  it("allows the owner to mute and kick a player", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetTables();
    resetTableStates();
    resetModeration();

    const summary = createTable({
      name: "Moderation Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 4,
        startingStack: 200,
        bettingStructure: "NoLimit",
      },
    });

    const app = createApp({ useInMemoryTelemetry: true });
    const ownerToken = signToken("owner-1");
    const userToken = signToken("user-2");

    await request(app)
      .post(`/api/tables/${summary.tableId}/join`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ seatId: 0 });

    const muteResponse = await request(app)
      .post(`/api/tables/${summary.tableId}/moderation/mute`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ seatId: 0 });

    expect(muteResponse.status).toBe(200);
    expect(muteResponse.body).toMatchObject({
      action: "mute",
      seatId: 0,
      userId: "user-2",
    });

    const kickResponse = await request(app)
      .post(`/api/tables/${summary.tableId}/moderation/kick`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ seatId: 0 });

    expect(kickResponse.status).toBe(200);
    expect(kickResponse.body).toMatchObject({
      action: "kick",
      seatId: 0,
      userId: "user-2",
    });

    const state = getTableState(summary.tableId);
    const seat = state?.seats.find((entry) => entry.seatId === 0);
    expect(seat?.userId).toBeNull();
  });
});
