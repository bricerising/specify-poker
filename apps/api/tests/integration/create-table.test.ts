import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { resetTables } from "../../src/services/tableRegistry";
import { resetTableStates } from "../../src/services/tableState";

const secret = "test-secret";

function signToken(userId = "owner-1") {
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

describe("create table endpoint", () => {
  it("creates a table and returns it in the lobby list", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetTables();
    resetTableStates();

    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken();

    const createResponse = await request(app)
      .post("/api/tables")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Created Table",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 6,
          startingStack: 500,
        },
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: "Created Table",
      ownerId: "owner-1",
      seatsTaken: 0,
      inProgress: false,
    });

    const listResponse = await request(app)
      .get("/api/tables")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableId: createResponse.body.tableId, name: "Created Table" }),
      ]),
    );
  });
});
