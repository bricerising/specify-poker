import { config } from "./config";
import { startGrpcServer } from "./api/grpc/server";
import { connectRedis } from "./storage/redisClient";

async function main() {
  try {
    await connectRedis();
    console.log("Connected to Redis");

    await startGrpcServer(config.port);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();
