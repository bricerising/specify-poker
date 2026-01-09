import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server";

const secret = "test-secret";

function signToken() {
  return jwt.sign(
    {
      sub: "user-123",
    },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

describe("websocket auth", () => {
  it("rejects missing token", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const port = (server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    const closeCode = await new Promise<number>((resolve) => {
      ws.on("close", (code) => resolve(code));
    });

    server.close();
    expect(closeCode).toBe(1008);
  });

  it("accepts valid token", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const port = (server.address() as AddressInfo).port;
    const token = signToken();
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);

    const welcome = await new Promise<string>((resolve, reject) => {
      ws.on("message", (data) => resolve(data.toString()));
      ws.on("error", reject);
    });

    ws.close();
    server.close();

    expect(JSON.parse(welcome).type).toBe("Welcome");
  });
});
